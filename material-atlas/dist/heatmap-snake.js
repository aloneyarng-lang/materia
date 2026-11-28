const rows = 7;
const directions = {
  ArrowUp: [0, -1], ArrowDown: [0, 1],
  ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

export function installHeatmapSnake() {
  let game;

  function stop(message) {
    if (!game) return;
    const {timer, board, calendar, detail, previous} = game;
    clearInterval(timer);
    board.remove();
    calendar.classList.remove('snake-calendar-hidden');
    if (detail) detail.textContent = message || previous;
    game = null;
  }

  function spawnFood() {
    const empty = game.cells.map((_, index) => index).filter(index => !game.body.includes(index));
    return empty[Math.floor(Math.random() * empty.length)];
  }

  function paint() {
    for (const cell of game.marked) cell.removeAttribute('data-snake');
    game.marked = [];
    function mark(index, type) {
      const cell = game.cells[index];
      cell.dataset.snake = type;
      game.marked.push(cell);
    }
    game.body.forEach((index, i) => mark(index, i ? 'body' : 'head'));
    mark(game.food, 'food');
  }

  function tick() {
    if (!game.board.isConnected || !game.board.getClientRects().length) return stop();
    const {body, columns, next} = game;
    game.direction = next;
    const x = (Math.floor(body[0] / rows) + next[0] + columns) % columns;
    const y = (body[0] % rows + next[1] + rows) % rows;
    const head = x * rows + y;
    const ate = head === game.food;
    if (!ate) body.pop();
    if (body.includes(head)) return stop('撞到自己了 · 得分 ' + (game.score) + ' · 点击左下角再玩一次');
    body.unshift(head);
    if (ate) {
      game.score++;
      game.food = spawnFood();
      if (game.food === undefined) return stop('通关 · 得分 ' + game.score);
      if (game.detail) game.detail.textContent = '得分 ' + game.score + ' · Esc 退出';
    }
    paint();
  }

  document.addEventListener('click', event => {
    const calendar = event.target.closest?.('#settings-import-activity .activity-calendar, #settings-focus-activity .activity-calendar');
    if (game && game.board.contains(event.target)) return;
    stop();
    if (!calendar || calendar.children[rows - 1] !== event.target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const columns = Math.ceil(calendar.children.length / rows);
    const board = document.createElement('div');
    board.className = 'activity-calendar snake-board';
    board.tabIndex = -1;
    board.setAttribute('aria-label', '贪吃蛇');
    const cells = Array.from({length: columns * rows}, () => document.createElement('i'));
    board.append(...cells);
    calendar.after(board);
    calendar.classList.add('snake-calendar-hidden');
    const detail = calendar.closest('.settings-activity')?.querySelector('[data-activity-detail], [data-pomo-detail]');
    const head = 2 * rows + rows - 1;
    game = {board, cells, columns, calendar, detail, previous: detail?.textContent,
      body: [head, head - rows, head - rows * 2], direction: directions.ArrowRight,
      next: directions.ArrowRight, score: 0, marked: [], timer: setInterval(tick, 200)};
    game.food = spawnFood();
    if (detail) detail.textContent = '贪吃蛇 · 方向键移动 · Esc 退出';
    board.focus({preventScroll: true});
    paint();
  }, true);

  window.addEventListener('keydown', event => {
    if (!game) return;
    if (document.activeElement !== game.board) return stop();
    const direction = directions[event.key];
    if (!direction && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!direction) {
      const trigger = game.calendar.children[rows - 1];
      stop();
      trigger.focus({preventScroll: true});
    } else if (direction[0] !== -game.direction[0] || direction[1] !== -game.direction[1]) {
      game.next = direction;
    }
  }, true);
  window.addEventListener('blur', () => stop());
}
