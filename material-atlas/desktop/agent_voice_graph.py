"""Single-sequence CUDA graph for the frozen GPT-SoVITS semantic transformer.

The upstream prefill and positional embeddings remain unchanged. Only the
one-token decoder is replayed with fixed KV storage and a dynamic validity mask.
"""
import math
import torch
from torch.nn import functional as F


class CachedSemanticTransformer:
    def __init__(self, original):
        self.original = original
        self.blocks = list(original.blocks)
        self.capacity = 0
        self.graph = None
        self.k_store = []
        self.v_store = []
        self.active = False
        self.cursor = 0
        self.replays = 0
        self.failed = False
        self.validated = False
        self.max_error = None

    def _decode(self):
        x = self.input
        valid = (self.indices <= self.position[0]).view(1, 1, 1, -1)
        for i, block in enumerate(self.blocks):
            q, k, v = F.linear(x, block.qkv_w, block.qkv_b).chunk(3, dim=-1)
            self.k_store[i].index_copy_(1, self.position, k)
            self.v_store[i].index_copy_(1, self.position, v)
            heads = block.num_heads
            q = q.view(1, 1, heads, -1).transpose(1, 2)
            keys = self.k_store[i].view(1, self.capacity, heads, -1).transpose(1, 2)
            values = self.v_store[i].view(1, self.capacity, heads, -1).transpose(1, 2)
            attn = F.scaled_dot_product_attention(q, keys, values, valid)
            attn = attn.transpose(1, 2).reshape(1, 1, -1)
            x = F.layer_norm(x + F.linear(attn, block.out_w, block.out_b),
                             [block.hidden_dim], block.norm_w1, block.norm_b1, block.norm_eps1)
            mlp = F.linear(F.relu(F.linear(x, block.mlp.w1, block.mlp.b1)),
                           block.mlp.w2, block.mlp.b2)
            x = F.layer_norm(x + mlp, [block.hidden_dim],
                             block.norm_w2, block.norm_b2, block.norm_eps2)
        self.output = x
        self.position.add_(1)

    def _restore(self, k_cache, v_cache):
        prefix = k_cache[0].shape[1]
        self.position.fill_(prefix)
        for dst, src in zip(self.k_store, k_cache):
            dst[:, :prefix].copy_(src)
        for dst, src in zip(self.v_store, v_cache):
            dst[:, :prefix].copy_(src)
        self.cursor = prefix

    def _capture(self, x, k_cache, v_cache):
        self.validated = False
        # 1,500 is the upstream semantic-generation limit.
        needed = k_cache[0].shape[1] + 1501
        self.capacity = 2 ** math.ceil(math.log2(needed))
        self.input = torch.empty_like(x)
        self.input.copy_(x)
        self.position = torch.zeros(1, dtype=torch.long, device=x.device)
        self.indices = torch.arange(self.capacity, device=x.device)
        shape = (1, self.capacity, k_cache[0].shape[-1])
        self.k_store = [torch.zeros(shape, dtype=x.dtype, device=x.device) for _ in self.blocks]
        self.v_store = [torch.zeros_like(k) for k in self.k_store]
        stream = torch.cuda.Stream()
        stream.wait_stream(torch.cuda.current_stream())
        with torch.cuda.stream(stream):
            for _ in range(3):
                self._restore(k_cache, v_cache)
                self._decode()
        torch.cuda.current_stream().wait_stream(stream)
        self._restore(k_cache, v_cache)
        self.graph = torch.cuda.CUDAGraph()
        with torch.cuda.graph(self.graph):
            self._decode()
        self._restore(k_cache, v_cache)

    def process_prompt(self, x, attn_mask, padding_mask=None, torch_sdpa=True):
        result = self.original.process_prompt(x, attn_mask, padding_mask, torch_sdpa)
        _, k_cache, v_cache = result
        self.active = not self.failed and x.is_cuda and x.shape[0] == 1 and padding_mask is None and torch_sdpa
        if self.active and self.graph is not None:
            if k_cache[0].shape[1] + 1501 > self.capacity:
                self.graph = None
            else:
                self._restore(k_cache, v_cache)
        return result

    def decode_next_token(self, x, k_cache, v_cache, attn_mask=None, torch_sdpa=True):
        if not self.active or x.shape[:2] != (1, 1) or attn_mask is not None or not torch_sdpa:
            return self.original.decode_next_token(x, k_cache, v_cache, attn_mask, torch_sdpa)
        if self.graph is None:
            self._capture(x, k_cache, v_cache)
        expected = None
        original_result = None
        if not self.validated:
            original_result = self.original.decode_next_token(x, k_cache, v_cache, attn_mask, torch_sdpa)
            expected = original_result[0]
        self.input.copy_(x)
        self.graph.replay()
        if expected is not None:
            self.max_error = float((self.output - expected).abs().max().item())
            if not torch.allclose(self.output, expected, atol=0.01, rtol=0.01):
                self.active = False
                self.failed = True
                self.graph = None
                return original_result
            self.validated = True
        self.cursor += 1
        self.replays += 1
        # Upstream callers pass these caches back; storage is owned by this wrapper.
        return self.output, self.k_store, self.v_store

