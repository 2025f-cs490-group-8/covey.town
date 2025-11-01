import { mock } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import { createPlayerForTesting } from '../../TestUtils';
import {
  GAME_ID_MISSMATCH_MESSAGE,
  GAME_NOT_IN_PROGRESS_MESSAGE,
  INVALID_COMMAND_MESSAGE,
} from '../../lib/InvalidParametersError';
import Player from '../../lib/Player';
import {
  GameInstanceID,
  QuantumTicTacToeGameState,
  QuantumTicTacToeMove,
  TownEmitter,
} from '../../types/CoveyTownSocket';
import Game from './Game';
import * as QuantumTicTacToeGameModule from './QuantumTicTacToeGame';
import QuantumTicTacToeGameArea from './QuantumTicTacToeGameArea';

class TestingGame extends Game<QuantumTicTacToeGameState, QuantumTicTacToeMove> {
  public constructor() {
    super({
      moves: [],
      status: 'WAITING_TO_START',
      xScore: 0,
      oScore: 0,
      moveCount: 0, // <-- missing
      publiclyVisible: {
        A: [
          [false, false, false],
          [false, false, false],
          [false, false, false],
        ],
        B: [
          [false, false, false],
          [false, false, false],
          [false, false, false],
        ],
        C: [
          [false, false, false],
          [false, false, false],
          [false, false, false],
        ],
      },
      games: {      // <-- missing
        A: { moves: [], status: 'WAITING_TO_START', x: undefined, o: undefined },
        B: { moves: [], status: 'WAITING_TO_START', x: undefined, o: undefined },
        C: { moves: [], status: 'WAITING_TO_START', x: undefined, o: undefined },
      },
    });

  }

  public applyMove(): void {}

  public endGame(winner?: string, xScore?: number, oScore?: number) {
    this.state = {
      ...this.state,
      status: 'OVER',
      winner,
      xScore: xScore || 0,
      oScore: oScore || 0,
    };
  }

  protected _join(player: Player): void {
    if (this.state.x) {
      this.state.o = player.id;
    } else {
      this.state.x = player.id;
    }
    if (this.state.x && this.state.o) {
      this.state.status = 'IN_PROGRESS';
    }
    this._players.push(player);
  }

  protected _leave(): void {}
}

describe('QuantumTicTacToeGameArea', () => {
  let gameArea: QuantumTicTacToeGameArea;
  let player1: Player;
  let player2: Player;
  let interactableUpdateSpy: jest.SpyInstance;
  let game: TestingGame;

  beforeEach(() => {
    const gameConstructorSpy = jest.spyOn(QuantumTicTacToeGameModule, 'default');
    game = new TestingGame();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore (Testing without using the real game class)
    gameConstructorSpy.mockReturnValue(game);

    player1 = createPlayerForTesting();
    player2 = createPlayerForTesting();
    gameArea = new QuantumTicTacToeGameArea(
      nanoid(),
      { x: 0, y: 0, width: 100, height: 100 },
      mock<TownEmitter>(),
    );
    gameArea.add(player1);
    gameArea.add(player2);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore (Test requires access to protected method)
    interactableUpdateSpy = jest.spyOn(gameArea, '_emitAreaChanged');
  });

  describe('handleCommand', () => {
    describe('when given a JoinGame command', () => {
      describe('when there is no game in progress', () => {
        it('should create a new game and call _emitAreaChanged', () => {
          const { gameID } = gameArea.handleCommand({ type: 'JoinGame' }, player1);
          expect(gameID).toBeDefined();
          if (!game) {
            throw new Error('Game was not created by the first call to join');
          }
          expect(gameID).toEqual(game.id);
          expect(interactableUpdateSpy).toHaveBeenCalledTimes(1);
        });
      });
      describe('when there is a game in progress', () => {
        it('should dispatch the join command to the game and call _emitAreaChanged', () => {
          const { gameID } = gameArea.handleCommand({ type: 'JoinGame' }, player1);
          if (!game) {
            throw new Error('Game was not created by the first call to join');
          }
          expect(interactableUpdateSpy).toHaveBeenCalledTimes(1);

          const joinSpy = jest.spyOn(game, 'join');
          const gameID2 = gameArea.handleCommand({ type: 'JoinGame' }, player2).gameID;
          expect(joinSpy).toHaveBeenCalledWith(player2);
          expect(gameID).toEqual(gameID2);
          expect(interactableUpdateSpy).toHaveBeenCalledTimes(2);
        });
      });
    });
    describe('when given a GameMove command', () => {
      it('should throw an error when there is no game in progress', () => {
        expect(() =>
          gameArea.handleCommand(
            {
              type: 'GameMove',
              move: { col: 0, row: 0, gamePiece: 'X', board: 'A' },
              gameID: nanoid(),
            },
            player1,
          ),
        ).toThrowError(GAME_NOT_IN_PROGRESS_MESSAGE);
      });
      describe('when there is a game in progress', () => {
        let gameID: GameInstanceID;
        beforeEach(() => {
          gameID = gameArea.handleCommand({ type: 'JoinGame' }, player1).gameID;

          gameArea.handleCommand({ type: 'JoinGame' }, player2);
          interactableUpdateSpy.mockClear();
        });
        it('should throw an error when the game ID does not match', () => {
          expect(() =>
            gameArea.handleCommand(
              {
                type: 'GameMove',
                move: { col: 0, row: 0, gamePiece: 'X', board: 'A' },
                gameID: nanoid(),
              },
              player1,
            ),
          ).toThrowError(GAME_ID_MISSMATCH_MESSAGE);
        });
        it('should dispatch the move to the game and call _emitAreaChanged', () => {
          const move: QuantumTicTacToeMove = { col: 0, row: 0, gamePiece: 'X', board: 'A' };
          const applyMoveSpy = jest.spyOn(game, 'applyMove');
          gameArea.handleCommand({ type: 'GameMove', move, gameID }, player1);
          expect(applyMoveSpy).toHaveBeenCalledWith({
            gameID: game.id,
            playerID: player1.id,
            move,
          });
          expect(interactableUpdateSpy).toHaveBeenCalledTimes(1);
        });
        describe('when the game is over, it records a new row in the history and calls _emitAreaChanged', () => {
          it('records the scores correctly', () => {
            const move: QuantumTicTacToeMove = { col: 0, row: 0, gamePiece: 'X', board: 'A' };
            jest.spyOn(game, 'applyMove').mockImplementationOnce(() => {
              game.endGame(player1.id, 2, 1);
            });
            gameArea.handleCommand({ type: 'GameMove', move, gameID }, player1);
            expect(game.state.status).toEqual('OVER');
            expect(gameArea.history.length).toEqual(1);
            expect(gameArea.history[0]).toEqual({
              gameID: game.id,
              scores: {
                [player1.userName]: 2,
                [player2.userName]: 1,
              },
            });
            expect(interactableUpdateSpy).toHaveBeenCalledTimes(1);
          });
        });
      });
    });
    describe('when given a LeaveGame command', () => {
      it('should throw an error when there is no game in progress', () => {
        expect(() =>
          gameArea.handleCommand({ type: 'LeaveGame', gameID: nanoid() }, player1),
        ).toThrowError(GAME_NOT_IN_PROGRESS_MESSAGE);
      });
      describe('when there is a game in progress', () => {
        it('should throw an error when the game ID does not match', () => {
          gameArea.handleCommand({ type: 'JoinGame' }, player1);
          interactableUpdateSpy.mockClear();
          expect(() =>
            gameArea.handleCommand({ type: 'LeaveGame', gameID: nanoid() }, player1),
          ).toThrowError(GAME_ID_MISSMATCH_MESSAGE);
        });
        it('should dispatch the leave command to the game and call _emitAreaChanged', () => {
          const { gameID } = gameArea.handleCommand({ type: 'JoinGame' }, player1);
          if (!game) {
            throw new Error('Game was not created by the first call to join');
          }
          expect(interactableUpdateSpy).toHaveBeenCalledTimes(1);
          const leaveSpy = jest.spyOn(game, 'leave');
          gameArea.handleCommand({ type: 'LeaveGame', gameID }, player1);
          expect(leaveSpy).toHaveBeenCalledWith(player1);
          expect(interactableUpdateSpy).toHaveBeenCalledTimes(2);
        });
      });
    });
    describe('when given an invalid command', () => {
      it('should throw an error', () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore (Testing an invalid command, only possible at the boundary of the type system)
        expect(() => gameArea.handleCommand({ type: 'InvalidCommand' }, player1)).toThrowError(
          INVALID_COMMAND_MESSAGE,
        );
        expect(interactableUpdateSpy).not.toHaveBeenCalled();
      });
    });
  });
});
