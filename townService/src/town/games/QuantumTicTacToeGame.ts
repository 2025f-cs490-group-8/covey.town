import {
  GameMove,
  QuantumTicTacToeGameState,
  QuantumTicTacToeMove,
} from '../../types/CoveyTownSocket';
import Game from './Game';
import TicTacToeGame from './TicTacToeGame';
import Player from '../../lib/Player';

/**
 * A QuantumTicTacToeGame is a Game that implements the rules of the Tic-Tac-Toe variant described at https://www.smbc-comics.com/comic/tic.
 * This class acts as a controller for three underlying TicTacToeGame instances, orchestrating the "quantum" rules by taking
 * the role of the monitor.
 */




export default class QuantumTicTacToeGame extends Game<
  QuantumTicTacToeGameState,
  QuantumTicTacToeMove
> {
  private _games: { A: TicTacToeGame; B: TicTacToeGame; C: TicTacToeGame };

  private _xScore: number;

  private _oScore: number;

  private _moveCount: number;

 public constructor() {
    super({
    status: 'WAITING_TO_START',
    winner: undefined,
    moves: [],
    x: undefined,
    o: undefined,
    xScore: 0,
    oScore: 0,
    moveCount: 0,
    publiclyVisible: {
      A: Array(3).fill(0).map(() => Array(3).fill(false)),
      B: Array(3).fill(0).map(() => Array(3).fill(false)),
      C: Array(3).fill(0).map(() => Array(3).fill(false)),
    },
    games: {
      A: { moves: [], status: 'WAITING_TO_START', x: undefined, o: undefined },
      B: { moves: [], status: 'WAITING_TO_START', x: undefined, o: undefined },
      C: { moves: [], status: 'WAITING_TO_START', x: undefined, o: undefined },
    },
  } as QuantumTicTacToeGameState);

  // Keep your private fields if you need them separately
  this._games = {
    A: new TicTacToeGame(),
    B: new TicTacToeGame(),
    C: new TicTacToeGame(),
  };
  this._xScore = 0;
  this._oScore = 0;
  this._moveCount = 0;
}

  public _join(player: Player): void {
 // Check if player is already in the game
  if (this.state.x === player.id || this.state.o === player.id) {
    throw new Error('Player is already in the game');
  }

  // Assign player to X or O
  if (!this.state.x) {
    this.state = { ...this.state, x: player.id };
  } else if (!this.state.o) {
    this.state = { ...this.state, o: player.id };
  } else {
    // Game is full
    throw new Error('Game is full');
  }

  // If both players are in, start the game
  if (this.state.x && this.state.o) {
    this.state = { ...this.state, status: 'IN_PROGRESS' };  
  }

  }public _leave(player: Player): void {
    // TODO: implement me
  }

  /**
   * Checks that the given move is "valid": that the it's the right
   * player's turn, that the game is actually in-progress, etc.
   * @see TicTacToeGame#_validateMove
   */
  private _validateMove(move: GameMove<QuantumTicTacToeMove>): void {
    // TODO: implement me
  }

  public applyMove(move: GameMove<QuantumTicTacToeMove>): void {
    this._validateMove(move);

    // TODO: implement the guts of this method

    this._checkForWins();
    this._checkForGameEnding();
  }

  /**
   * Checks all three sub-games for any new three-in-a-row conditions.
   * Awards points and marks boards as "won" so they can't be played on.
   */
  private _checkForWins(): void {
    // TODO: implement me
  }

  /**
   * A Quantum Tic-Tac-Toe game ends when no more moves are possible.
   * This happens when all squares on all boards are either occupied or part of a won board.
   */
  private _checkForGameEnding(): void {
    // TODO: implement me
  }
}
