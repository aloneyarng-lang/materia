import {html} from './i18n.js';

export function agentServiceForm(prefix = '') {
  const form = html`<form id="agent-config-form"><div class="agent-config-fields">
      <label>接入方式<select id="agent-connection"><option value="api">API 服务</option><option value="local-gemini">本地 Gemini</option><option value="antigravity">本地反重力 · Antigravity</option></select></label>
      <section id="agent-gemini-settings" hidden><p class="agent-help">使用已登录的 Gemini Windows 客户端。检测客户端可读取可用模型。</p><label>Gemini 模型<select id="agent-gemini-model"><option value="desktop-current">桌面端当前模型</option></select></label><button type="button" class="text-button" data-local-agent="test">测试 Gemini 对话</button></section>
      <section id="agent-antigravity-settings" hidden>
        <p class="agent-help">Materia 在后台连接反重力。桌面接口不可用时，自动使用本机已登录的官方 agy CLI 收发文本。</p>
        <label>客户端程序<input id="agent-client-path" placeholder="自动查找 Antigravity.exe，也可选择程序" maxlength="2000" autocomplete="off" spellcheck="false"></label>
        <div class="agent-local-actions"><button type="button" class="text-button" data-local-agent="open">启动反重力</button><button type="button" class="text-button" data-local-agent="choose">选择程序</button><button type="button" class="text-button" data-local-agent="test">测试对话</button></div>
        <label>客户端可用模型<select id="agent-client-model"><option value="">使用客户端列表首个可用模型</option></select></label>
        <p class="agent-help">检测客户端 → 选择模型 → 保存。“测试对话”会发送一句测试消息并使用少量额度。角色卡、历史、文献检索及阅读翻译均可继续使用。当前为客户端兼容接入，客户端升级后可能需要更新 Materia。</p>
      </section>
      <div id="agent-api-settings">
      <label>AI 服务厂商<select id="agent-provider" aria-describedby="agent-provider-hint"></select></label>
      <p id="agent-provider-hint" class="agent-help"></p>
      <div id="agent-custom-settings"><label>API 地址<input id="agent-base-url" type="url" placeholder="https://api.example.com/v1" autocomplete="off"></label><label>API 协议<select id="agent-protocol"><option value="chat">Chat Completions</option><option value="responses">Responses</option><option value="anthropic">Claude Messages</option></select></label></div>
      <div class="agent-settings-columns"><div class="agent-settings-field-group">
      <label>API 密钥<input id="agent-key" type="password" placeholder="填写所选厂商的 API Key" maxlength="4096" autocomplete="off" spellcheck="false"></label>
      <label class="agent-remember"><input id="agent-remember" type="checkbox">用系统加密记住密钥（仅桌面版）</label>
      </div><div class="agent-settings-field-group">
      <label id="agent-model-picker-field">可用模型<select id="agent-model-select" aria-describedby="agent-connection-status"></select></label>
      <label id="agent-manual-model-field">模型名称<input id="agent-model" placeholder="填写服务提供的模型 ID" maxlength="200" autocomplete="off"></label>
      <label class="agent-remember"><input id="agent-model-manual" type="checkbox">手动填写模型 ID</label>
      </div></div>
      <p class="agent-help">研究对话需模型支持工具调用，翻译无需。自动获取仅查询模型列表，不产生对话。本机服务可使用 http://localhost 地址。密钥不写入文献库或备份。</p>
      </div>
      </div><div class="agent-config-actions"><button type="button" class="text-button" data-agent-action="forget">清除密钥</button><button class="primary" type="submit">保存设置</button></div>
    </form>`;
  return prefix ? form.replace(/((?:id|aria-describedby)=")(agent-)/g, '$1' + prefix + '$2') : form;
}
