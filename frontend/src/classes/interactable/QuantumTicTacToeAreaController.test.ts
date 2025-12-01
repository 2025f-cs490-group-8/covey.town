import assert from 'assert';
import { mock } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import {
  GameArea,
  GameResult,
  GameStatus,
  QuantumTicTacToeGameState,
  QuantumTicTacToeMove,
  TicTacToeGridPosition,
} from '../../types/CoveyTownSocket';
import PlayerController from '../PlayerController';
import TownController from '../TownController';
import GameAreaController, { NO_GAME_IN_PROGRESS_ERROR } from './GameAreaController';
import QuantumTicTacToeAreaController from './QuantumTicTacToeAreaController';

describe('QuantumTicTacToeAreaController', () => {
  const ourPlayer = new PlayerController(nanoid(), nanoid(), {
    x: 0,
    y: 0,
    moving: false,
    rotation: 'front',
  });
  const otherPlayers = [
    new PlayerController(nanoid(), nanoid(), { x: 0, y: 0, moving: false, rotation: 'front' }),
    new PlayerController(nanoid(), nanoid(), { x: 0, y: 0, moving: false, rotation: 'front' }),
  ];

  const mockTownController = mock<TownController>();
  Object.defineProperty(mockTownController, 'ourPlayer', {
    get: () => ourPlayer,
  });
  Object.defineProperty(mockTownController, 'players', {
    get: () => [ourPlayer, ...otherPlayers],
  });
  mockTownController.getPlayer.mockImplementation(playerID => {
    const p = mockTownController.players.find(player => player.id === playerID);
    assert(p);
    return p;
  });

  function quantumTicTacToeAreaControllerWithProp({
    _id,
    history,
    x,
    o,
    xScore,
    oScore,
    undefinedGame,
    status,
    moves,
    winner,
    publiclyVisible,
  }: {
    _id?: string;
    history?: GameResult[];
    x?: string;
    o?: string;
    xScore?: number;
    oScore?: number;
    undefinedGame?: boolean;
    status?: GameStatus;
    moves?: QuantumTicTacToeMove[];
    winner?: string;
    publiclyVisible?: { A: boolean[][]; B: boolean[][]; C: boolean[][] };
  }) {
    const id = _id || nanoid();
    const players = [];
    if (x) players.push(x);
    if (o) players.push(o);
    if (winner && !players.includes(winner)) players.push(winner);
    const ret = new QuantumTicTacToeAreaController(
      id,
      {
        id,
        occupants: players,
        history: history || [],
        type: 'QuantumTicTacToeArea',
        game: undefinedGame
          ? undefined
          : {
              id,
              players: players,
              state: {
                status: status || 'IN_PROGRESS',
                x,
                o,
                moves: moves || [],
                winner,
                xScore: xScore || 0,
                oScore: oScore || 0,
                publiclyVisible: publiclyVisible || {
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
              },
            },
      },
      mockTownController,
    );
    if (players) {
      ret.occupants = players
        .map(eachID => mockTownController.players.find(eachPlayer => eachPlayer.id === eachID))
        .filter(eachPlayer => eachPlayer) as PlayerController[];
    }
    return ret;
  }
  describe('getters', () => {
    it('should return the correct x player', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ x: ourPlayer.id });
      expect(controller.x).toBe(ourPlayer);
    });

    it('should return the correct o player', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ o: otherPlayers[0].id });
      expect(controller.o).toBe(otherPlayers[0]);
    });

    it('should return the correct x score', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ xScore: 5 });
      expect(controller.xScore).toBe(5);
    });

    it('should return the correct o score', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ oScore: 3 });
      expect(controller.oScore).toBe(3);
    });

    it('should return the correct move count', () => {
      const moves: QuantumTicTacToeMove[] = [
        { gamePiece: 'X', board: 'A', row: 0, col: 0 },
        { gamePiece: 'O', board: 'B', row: 1, col: 1 },
      ];
      const controller = quantumTicTacToeAreaControllerWithProp({ moves });
      expect(controller.moveCount).toBe(2);
    });

    it('should return the correct winner', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ winner: ourPlayer.id });
      expect(controller.winner).toBe(ourPlayer);
    });

    it('should return the correct whoseTurn', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({
        x: ourPlayer.id,
        o: otherPlayers[0].id,
      });
      expect(controller.whoseTurn).toBe(ourPlayer);
      const moves: QuantumTicTacToeMove[] = [{ gamePiece: 'X', board: 'A', row: 0, col: 0 }];
      const controller2 = quantumTicTacToeAreaControllerWithProp({
        x: ourPlayer.id,
        o: otherPlayers[0].id,
        moves,
      });
      expect(controller2.whoseTurn).toBe(otherPlayers[0]);
    });

    it('should return the correct isOurTurn', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({
        x: ourPlayer.id,
        o: otherPlayers[0].id,
      });
      expect(controller.isOurTurn).toBe(true);
    });

    it('should return the correct isPlayer', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ x: ourPlayer.id });
      expect(controller.isPlayer).toBe(true);
      const controller2 = quantumTicTacToeAreaControllerWithProp({ x: otherPlayers[0].id });
      expect(controller2.isPlayer).toBe(false);
    });

    it('should return the correct gamePiece', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ x: ourPlayer.id });
      expect(controller.gamePiece).toBe('X');
      const controller2 = quantumTicTacToeAreaControllerWithProp({ o: ourPlayer.id });
      expect(controller2.gamePiece).toBe('O');
    });

    it('should throw an error for gamePiece if not a player', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({
        x: otherPlayers[0].id,
        o: otherPlayers[1].id,
      });
      expect(() => controller.gamePiece).toThrowError();
    });

    it('should return the correct status', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ status: 'OVER' });
      expect(controller.status).toBe('OVER');
    });

    it('should return true for isActive if game is IN_PROGRESS', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ status: 'IN_PROGRESS' });
      expect(controller.isActive()).toBe(true);
    });

    it('should return false for isActive if game is OVER', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ status: 'OVER' });
      expect(controller.isActive()).toBe(false);
    });

    it('should return empty boards by default', () => {
      const controller = quantumTicTacToeAreaControllerWithProp({});
      expect(controller.boards).toEqual({
        A: [
          [undefined, undefined, undefined],
          [undefined, undefined, undefined],
          [undefined, undefined, undefined],
        ],
        B: [
          [undefined, undefined, undefined],
          [undefined, undefined, undefined],
          [undefined, undefined, undefined],
        ],
        C: [
          [undefined, undefined, undefined],
          [undefined, undefined, undefined],
          [undefined, undefined, undefined],
        ],
      });
    });
  });

  describe('makeMove', () => {
    it('should throw an error if the game is not in progress', async () => {
      const controller = quantumTicTacToeAreaControllerWithProp({ status: 'OVER' });
      await expect(async () => controller.makeMove('A', 0, 0)).rejects.toEqual(
        new Error(NO_GAME_IN_PROGRESS_ERROR),
      );
    });
    it('Should call townController.sendInteractableCommand', async () => {
      const controller = quantumTicTacToeAreaControllerWithProp({
        status: 'IN_PROGRESS',
        x: ourPlayer.id,
        o: otherPlayers[0].id,
      });
      const instanceID = nanoid();
      mockTownController.sendInteractableCommand.mockImplementationOnce(async () => {
        return { gameID: instanceID };
      });
      await controller.joinGame();
      mockTownController.sendInteractableCommand.mockReset();
      await controller.makeMove('B', 2, 1);
      expect(mockTownController.sendInteractableCommand).toHaveBeenCalledWith(controller.id, {
        type: 'GameMove',
        gameID: instanceID,
        move: {
          board: 'B',
          row: 2,
          col: 1,
          gamePiece: 'X',
        },
      });
    });
  });

  describe('_updateFrom', () => {
    describe('if the game is in progress', () => {
      let controller: QuantumTicTacToeAreaController;
      beforeEach(() => {
        controller = quantumTicTacToeAreaControllerWithProp({
          status: 'IN_PROGRESS',
          x: ourPlayer.id,
          o: otherPlayers[0].id,
        });
      });
      it('should emit a boardChanged event with the new board', () => {
        const model = controller.toInteractableAreaModel();
        const newMoves: ReadonlyArray<QuantumTicTacToeMove> = [
          {
            gamePiece: 'X',
            board: 'A',
            row: 0 as TicTacToeGridPosition,
            col: 0 as TicTacToeGridPosition,
          },
          {
            gamePiece: 'O',
            board: 'C',
            row: 1 as TicTacToeGridPosition,
            col: 1 as TicTacToeGridPosition,
          },
        ];
        assert(model.game);
        const newModel: GameArea<QuantumTicTacToeGameState> = {
          ...model,
          game: {
            ...model.game,
            state: {
              ...model.game.state,
              moves: newMoves,
            },
          },
        };
        const emitSpy = jest.spyOn(controller, 'emit');
        controller.updateFrom(newModel, otherPlayers.concat(ourPlayer));
        const boardChangedCall = emitSpy.mock.calls.find(call => call[0] === 'boardChanged');
        expect(boardChangedCall).toBeDefined();
        if (boardChangedCall) {
          expect(boardChangedCall[1]).toEqual({
            A: [
              ['X', undefined, undefined],
              [undefined, undefined, undefined],
              [undefined, undefined, undefined],
            ],
            B: [
              [undefined, undefined, undefined],
              [undefined, undefined, undefined],
              [undefined, undefined, undefined],
            ],
            C: [
              [undefined, undefined, undefined], // Opponent's move is not public, so it's not visible
              [undefined, undefined, undefined],
              [undefined, undefined, undefined],
            ],
          });
        }
      });
      it('should only show opponent moves on publicly visible squares', () => {
        const model = controller.toInteractableAreaModel();
        const newMoves: ReadonlyArray<QuantumTicTacToeMove> = [
          {
            gamePiece: 'X',
            board: 'A',
            row: 0,
            col: 0,
          },
          {
            gamePiece: 'O',
            board: 'B',
            row: 1,
            col: 1,
          },
          {
            gamePiece: 'X',
            board: 'C',
            row: 2,
            col: 2,
          },
          {
            gamePiece: 'O',
            board: 'C',
            row: 0,
            col: 0,
          },
        ];
        assert(model.game);
        const newModel: GameArea<QuantumTicTacToeGameState> = {
          ...model,
          game: {
            ...model.game,
            state: {
              ...model.game.state,
              moves: newMoves,
              publiclyVisible: {
                A: [
                  [false, false, false],
                  [false, false, false],
                  [false, false, false],
                ],
                B: [
                  [false, false, false],
                  [false, true, false],
                  [false, false, false],
                ],
                C: [
                  [false, false, false],
                  [false, false, false],
                  [false, false, false],
                ],
              },
            },
          },
        };
        controller.updateFrom(newModel, otherPlayers.concat(ourPlayer));
        const boards = controller.boards;
        expect(boards.A[0][0]).toBe('X'); // Our move, always visible
        expect(boards.B[1][1]).toBe('O'); // Opponent move, public
        expect(boards.C[2][2]).toBe('X'); // Our move, always visible
        expect(boards.C[0][0]).toBeUndefined(); // Opponent move, not public
      });
      it('should show the original move on a square that becomes publicly visible due to a collision', () => {
        const model = controller.toInteractableAreaModel();
        assert(model.game);
        // 1. X (our player) makes a move on A[0][0]. It is not public.
        const moves: QuantumTicTacToeMove[] = [{ gamePiece: 'X', board: 'A', row: 0, col: 0 }];
        let newModel: GameArea<QuantumTicTacToeGameState> = {
          ...model,
          game: {
            ...model.game,
            state: {
              ...model.game.state,
              moves,
            },
          },
        };
        controller.updateFrom(newModel, otherPlayers.concat(ourPlayer));
        expect(controller.boards.A[0][0]).toBe('X');

        // 2. O (other player) makes a move on the same square, causing a collision.
        // The square becomes publicly visible.
        const movesAfterCollision: QuantumTicTacToeMove[] = [
          ...moves,
          { gamePiece: 'O', board: 'A', row: 0, col: 0 },
        ];
        newModel = {
          ...model,
          game: {
            ...model.game,
            state: {
              ...model.game.state,
              moves: movesAfterCollision,
              publiclyVisible: {
                ...model.game.state.publiclyVisible,
                A: [
                  [true, false, false],
                  [false, false, false],
                  [false, false, false],
                ],
              },
            },
          },
        };
        controller.updateFrom(newModel, otherPlayers.concat(ourPlayer));

        // The board should show 'X', as it was the first piece placed there.
        expect(controller.boards.A[0][0]).toBe('X');
      });

      it('should emit a turnChanged event with true if it is our turn', () => {
        const model = controller.toInteractableAreaModel();
        // Set the controller to a state where it is NOT our turn (O's turn)
        assert(model.game);
        model.game.state.moves = [{ gamePiece: 'X', board: 'A', row: 0, col: 0 }];
        controller.updateFrom(model, otherPlayers.concat(ourPlayer));

        assert(model.game);
        const newModel: GameArea<QuantumTicTacToeGameState> = {
          ...model,
          game: {
            ...model.game,
            state: {
              ...model.game.state,
              // The new state has two moves, so it is our turn (X's turn)
              moves: [
                { gamePiece: 'X', board: 'A', row: 0, col: 0 },
                { gamePiece: 'O', board: 'B', row: 0, col: 0 },
              ],
            },
          },
        };
        const emitSpy = jest.spyOn(controller, 'emit');
        controller.updateFrom(newModel, otherPlayers.concat(ourPlayer));
        const turnChangedCall = emitSpy.mock.calls.find(call => call[0] === 'turnChanged');
        expect(turnChangedCall).toBeDefined();
        if (turnChangedCall) expect(turnChangedCall[1]).toEqual(true);
      });
    });
    it('should call super._updateFrom', () => {
      // @ts-expect-error _updateFrom is not public, but we're accessing it here for testing purposes only
      const spy = jest.spyOn(GameAreaController.prototype, '_updateFrom');
      const controller = quantumTicTacToeAreaControllerWithProp({});
      const model = controller.toInteractableAreaModel();
      controller.updateFrom(model, otherPlayers.concat(ourPlayer));
      expect(spy).toHaveBeenCalled();
    });
  });
});
