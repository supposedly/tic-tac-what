const PLAYER_COUNT = 2;
const BOARD_WIDTH = 16;
const BOARD_HEIGHT = 16;
const MINE_COUNT = 20;


// an enum, ish
const Clicks = Object.freeze({
  LEFT: 1,
  RIGHT: 2,
});


const MINESWEEPER_MSGS = [
  "{name}'s a darmn minesleeper",
  '{name} got SWEPT',
  "{name}'s doin july 4th early this year",
  'mine your own sweepwax, {name}',
  "you don't deserve a minesweeper pun, {name}",
];

const TICTACTOE_MSGS = [
  "{name} tic'd when they shoulda tac'd",
  '{name} got tic-tac-told',
  'tic tac go home, {name}',
];
const TICTACTOE_EXTRAS = {
  O: [
    'is this lOOOss, {name}?',
    'R.K.O.O.O. outta nowhere, {name}!',
  ],
  X: [
    "{name} got tentacion'd",
    '{name} keeps it 30, like the romans',
  ],
};


function getMessage(messages, name) {
  const s = messages[Math.floor(Math.random() * messages.length)]
    .replace('{name}', name);
  return `${s}\xa0`; // for padding
}


class PairSet {
  constructor(values) {
    this._map = {};
    values.forEach(this.add);
  }

  _hasPrimary(a) {
    return Object.prototype.hasOwnProperty.call(this._map, a);
  }

  forEach(callback) {
    Object.keys(this._map).forEach(
      a => this._map[a].forEach(
        b => callback(a, b)
      )
    );
  }

  size() {
    return Object.keys(this._map).reduce(
      a => this._map[a].size(),
      0
    );
  }

  clear() {
    this._map.clear();
  }

  add(a, b) {
    if (!this._hasPrimary(a)) {
      this._map[a] = new Set();
    }
    this._map[a].add(b);
  }

  delete(a, b) {
    this._map[a].delete(b);
    if (this._map[a].size() === 0) {
      delete this._map[a];
    }
  }

  has(a, b) {
    if (!this._hasPrimary(a)) {
      return false;
    }
    return this._map[a].has(b);
  }
}


class Tile extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y, texture) {
    super(scene, x * 32, 64 + y * 32, texture);
    this.setOrigin(0, 0)
      .setInteractive()
      .on('pointerdown', () => { if (this.isCovered()) this.setTint(0x777777); })
      .on('pointerup', this.changeState);
    this._state = -10;
    this._isFlagged = false;
    this._flaggedBy = null;
    this.boardX = x;
    this.boardY = y;
  }

  // eslint-disable-next-line class-methods-use-this
  _playerToKey(currentPlayer) {
    return currentPlayer === 0 ? 'x' : 'o';
  }

  changeState(data) {
    this.clearTint();
    let changeTurn = true;
    switch (data.buttons) {
      case Clicks.LEFT:
        changeTurn = this.scene.uncover(this);
        break;
      case Clicks.RIGHT:
        if (this.isFlagged()) {
          changeTurn = this.scene.unflag(this);
        } else {
          changeTurn = this.scene.flag(this);
        }
        break;
      default:
        return;
    }
    if (changeTurn) {
      this.scene.changeTurn();
    }
  }

  setState(num) {
    this._state = num;
    this.setTexture(num < 0 ? 'covered-tile' : num.toString());
  }

  isCovered() {
    return this._state < 0;
  }

  isFlagged(currentPlayer = null) {
    if (!this.isCovered()) {
      return false;
    }
    return this._isFlagged && (currentPlayer === null || this._flaggedBy === currentPlayer);
  }

  flaggedBy() {
    return this._flaggedBy;
  }

  uncover() {
    if (!this.isCovered()) {
      return;
    }
    this._state = -this._state;
    if (this._state === 10) {
      this._state = 0;
    }
    this.setTexture(this._state.toString());
  }

  flag(currentPlayer) {
    if (!this.isCovered() || this.isFlagged()) {
      return;
    }
    this.setTexture(`${this._playerToKey(currentPlayer)}-flagged-tile`);
    this._isFlagged = true;
    this._flaggedBy = currentPlayer;
  }

  unflag(currentPlayer = null) {
    if (!this.isCovered() || (currentPlayer !== null && this._flaggedBy !== currentPlayer)) {
      return false;
    }
    this.setTexture('covered-tile');
    this._isFlagged = false;
    this._flaggedBy = null;
    return true;
  }
}


class FlagCountText extends Phaser.GameObjects.Text {
  constructor(scene, value, x, y, max = null, min = 0) {
    super(scene, x, y, value.toString());
    this.setOrigin(0, 0);
    this.intValue = value;
    this.maxValue = max === null ? this.intValue : max;
    this.minValue = min;
  }

  decrement() {
    if (this.intValue > this.minValue) {
      this.intValue -= 1;
      this.setText(this.intValue.toString());
    }
  }

  increment() {
    if (this.intValue < this.maxValue) {
      this.intValue += 1;
      this.setText(this.intValue.toString());
    }
  }
}


class Scene extends Phaser.Scene {
  /* class vars assigned after class def
  static TURN_ICONS = ['x', 'o'];
  static PLAYER_COLORS = ['#f44', '#67f'];
   */

  initialize() {
    this.clickedYet = false;
    this.currentPlayer = 0;
    this.playerText = null;

    /*
    this.initialTime = null;
    this.timeText = null;
    */

    this.playerCount = PLAYER_COUNT;
    this.mineCount = MINE_COUNT;
    this.boardHeight = BOARD_HEIGHT;
    this.boardWidth = BOARD_WIDTH;
    this.board = new Array(this.boardHeight)
      .fill(null)
      .map(() => new Array(this.boardWidth).fill(-10));

    // XXX: I seriously don't know why I didn't just make a Player class
    this.playerFlags = new Array(this.playerCount).fill(null);
    this.correctFlags = new PairSet();
    this.incorrectFlags = new PairSet();

    this.gameOverMessage = null;
    this.otherGameOverMessage = null;
  }

  preload() {
    this.initialize();
    this.load.image('restart', 'assets/restart.png');
    this.load.image('x', 'assets/x.png');
    this.load.image('o', 'assets/o.png');
    this.load.image('x-flagged-tile', 'assets/x-flagged-tile.png');
    this.load.image('o-flagged-tile', 'assets/o-flagged-tile.png');
    this.load.image('covered-tile', 'assets/covered-tile.png');
    this.load.image('0', 'assets/0.png');
    this.load.image('1', 'assets/1.png');
    this.load.image('2', 'assets/2.png');
    this.load.image('3', 'assets/3.png');
    this.load.image('4', 'assets/4.png');
    this.load.image('5', 'assets/5.png');
    this.load.image('6', 'assets/6.png');
    this.load.image('7', 'assets/7.png');
    this.load.image('8', 'assets/8.png');
    this.load.image('9', 'assets/bomb.png');
  }

  create() {
    this.input.mouse.disableContextMenu();
    /* this.timeText = this.add.text(0, 0).setOrigin(0, 0).setText('000'); */
    this.playerText = this.add.text(2, 0, '', { fontSize: 25, fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0, 0);
    this._setTurnText();
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        this.board[y][x] = this.add.existing(new Tile(this, x, y, 'covered-tile'));
      }
    }

    for (let i = 0; i < this.playerCount; i++) {
      this.add.image(544, 32 * i + 64, Scene.TURN_ICONS[i]).setOrigin(0, 0);
      this.playerFlags[i] = new FlagCountText(this, this.mineCount, 584, 32 * i + 72);
      this.add.existing(this.playerFlags[i]);
    }

    const restartButton = this.add.image(656, 0, 'restart');
    restartButton
      .setOrigin(0, 0)
      .setInteractive()
      .on('pointerdown', () => restartButton.setTint(0x777777))
      .on('pointerup', () => { restartButton.clearTint(); this.scene.restart(); });

    this.gameOverMessage = this.add
      .text(90, 32, '', {
        fontSize: 50,
        fontFamily: 'monospace',
      })
      .setBackgroundColor('#000');
    this.otherGameOverMessage = this.add
      .text(90, 80, '', {
        fontSize: 20,
        fontFamily: 'monospace',
        wordWrap: { width: 400 },
      })
      .setBackgroundColor('#000');
  }

  /*
  update(time, delta) {
    if (!this.clickedYet) {
      return;
    }
    if (this.initialTime === null) {
      this.initialTime = time / 1000;
    }
    this.timeText.setText(
      Math.floor(time / 1000 - this.initialTime)
        .toLocaleString('en', {
          maximumFractionDigits: 0,
          minimumIntegerDigits: 3,
        }),
    );
  }
  */

  restart() {
    this.scene.restart();
  }

  _setTurnText() {
    const turnText = `PLAYER ${this.currentPlayer + 1}\n${Scene.TURN_ICONS[this.currentPlayer]}`;
    this.playerText.setText(turnText);
    this.playerText.setColor(Scene.PLAYER_COLORS[this.currentPlayer]);
  }

  changeTurn() {
    this.currentPlayer = (this.currentPlayer + 1) % 2;
    this._setTurnText();
  }

  gameWon(player, messages) {
    // prolly better ways to choose random number sans one value than this
    const choices = Array.from(
      { length: this.playerCount },
      (_, k) => k + (k >= player)
    ).slice(0, -1);
    this.gameLost(choices[Math.floor(Math.random() * choices.length)], player, messages);
  }

  gameLost(player, winner, messages) {
    this.gameOverMessage
      .setColor(Scene.PLAYER_COLORS[winner])
      .setText(`PLAYER ${winner + 1} WINS`);
    this.otherGameOverMessage
      .setText(getMessage(messages, `player ${player + 1}`));
  }

  ticTacToeWin(tile, length = 3, previousX = 0, previousY = 0, textureKey = null) {
    if (textureKey === null) {
      textureKey = tile.texture.key;
    }
    if (!tile.isFlagged()) {
      return false;
    }
    if (length <= 1) {
      return tile.texture.key === textureKey;
    }
    let won = false;
    this.iterateMooreNeighborhood(
      tile.boardX, tile.boardY,
      (neighbor, xOffset, yOffset) => {
        neighbor.setTint(0xffffff);
        // wins can only happen in a straight line
        if (
          (previousX === 0 && previousY === 0)
          || (xOffset === previousX && yOffset === previousY)
        ) {
          won = won || (
            this.ticTacToeWin(neighbor, length - 1, xOffset, yOffset, textureKey)
            && tile.texture.key === textureKey
          );
        }
      },
      () => won
    );
    return won && tile.texture.key === textureKey;
  }

  flag(tile) {
    if (
      !tile.isCovered()
      || tile.isFlagged()
      || this.playerFlags[this.currentPlayer] === 0
    ) {
      return false;
    }
    let valid = false;
    this.iterateMooreNeighborhood(
      tile.boardX, tile.boardY,
      (neighbor) => {
        valid = valid || (neighbor._state > 0 || neighbor.isFlagged(this.currentPlayer));
      }
    );
    if (valid) {
      tile.flag(this.currentPlayer);
      this.playerFlags[this.currentPlayer].decrement();
      // XXX: below line is jaaaankkyyy
      const xo = tile.texture.key.charAt(0).toUpperCase();
      if (this.ticTacToeWin(tile)) {
        this.gameWon(this.currentPlayer, TICTACTOE_MSGS.concat(TICTACTOE_EXTRAS[xo]));
      }
    }
    return valid;
  }

  unflag(tile) {
    const ret = tile.unflag(this.currentPlayer);
    if (ret) {
      this.playerFlags[this.currentPlayer].increment();

    }
    return ret;
  }

  uncover(tile) {
    if (!tile.isCovered() || tile.isFlagged()) {
      return false;
    }
    if (!this.clickedYet) {
      this.clickedYet = true;
      this.populate(tile.boardX, tile.boardY);
    }
    const oldState = tile._state;
    tile.uncover();
    if (oldState === -10) {
      this.iterateMooreNeighborhood(tile.boardX, tile.boardY, this.uncover.bind(this));
    }
    if (oldState === -9) {
      // XXX: the +(!...) is bad bad baaaad
      this.gameLost(this.currentPlayer, +(!this.currentPlayer), MINESWEEPER_MSGS);
    }
    return true;
  }

  populate(avoidX, avoidY) {
    for (let count = 0; count < this.mineCount; count++) {
      let x; let
        y;
      do {
        x = Math.floor(Math.random() * this.boardWidth);
        y = Math.floor(Math.random() * this.boardHeight);
      } while (
        Math.abs(x - avoidX) <= 1
        || Math.abs(y - avoidY) <= 1
        || this.board[y][x]._state === -9
      );
      this.board[y][x].setState(-9);
    }
    this.board.forEach(arr => arr.forEach(
      (tile) => {
        if (Math.abs(tile._state) !== 9) {
          tile.setState(-this.countBombNeighbors(tile.boardX, tile.boardY) || -10);
        }
      }
    ));
  }

  countBombNeighbors(x, y) {
    let total = 0;
    this.iterateMooreNeighborhood(
      x, y,
      (neighbor) => { total += (Math.abs(neighbor._state) === 9); }
    );
    return total;
  }

  iterateMooreNeighborhood(x, y, callback, breakCallback = null) {
    for (let yOffset = -1; yOffset <= 1; yOffset++) {
      if (y + yOffset < 0 || y + yOffset >= this.boardHeight) {
        continue;
      }
      for (let xOffset = -1; xOffset <= 1; xOffset++) {
        if (
          x + xOffset < 0
          || x + xOffset >= this.boardWidth
          || (yOffset === 0 && xOffset === 0)
        ) {
          continue;
        }
        const neighbor = this.board[y + yOffset][x + xOffset];
        callback(neighbor, xOffset, yOffset);
        if (breakCallback !== null && breakCallback(neighbor, xOffset, yOffset)) {
          return;
        }
      }
    }
  }
}
Scene.TURN_ICONS = ['x', 'o'];
Scene.PLAYER_COLORS = ['#f44', '#67f'];


// eslint-disable-next-line no-new
new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 800,
  scene: Scene,
});
