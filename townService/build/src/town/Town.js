import { nanoid } from 'nanoid';
import InvalidParametersError from '../lib/InvalidParametersError';
import Player from '../lib/Player';
import TwilioVideo from '../lib/TwilioVideo';
import { isViewingArea } from '../TestUtils';
import { logError } from '../Utils';
import ConversationArea from './ConversationArea';
import GameAreaFactory from './games/GameAreaFactory';
import ViewingArea from './ViewingArea';
export default class Town {
    get capacity() {
        return this._capacity;
    }
    set isPubliclyListed(value) {
        this._isPubliclyListed = value;
        this._broadcastEmitter.emit('townSettingsUpdated', { isPubliclyListed: value });
    }
    get isPubliclyListed() {
        return this._isPubliclyListed;
    }
    get townUpdatePassword() {
        return this._townUpdatePassword;
    }
    get players() {
        return this._players;
    }
    get occupancy() {
        return this.players.length;
    }
    get friendlyName() {
        return this._friendlyName;
    }
    set friendlyName(value) {
        this._friendlyName = value;
        this._broadcastEmitter.emit('townSettingsUpdated', { friendlyName: value });
    }
    get townID() {
        return this._townID;
    }
    get interactables() {
        return this._interactables;
    }
    _players = [];
    _videoClient = TwilioVideo.getInstance();
    _interactables = [];
    _townID;
    _friendlyName;
    _townUpdatePassword;
    _isPubliclyListed;
    _capacity;
    _broadcastEmitter;
    _connectedSockets = new Set();
    _chatMessages = [];
    _playerSockets = new Map();
    _pendingFriendRequests = new Map();
    constructor(friendlyName, isPubliclyListed, townID, broadcastEmitter) {
        this._townID = townID;
        this._capacity = 50;
        this._townUpdatePassword = nanoid(24);
        this._isPubliclyListed = isPubliclyListed;
        this._friendlyName = friendlyName;
        this._broadcastEmitter = broadcastEmitter;
    }
    async addPlayer(userName, socket) {
        const newPlayer = new Player(userName, socket.to(this._townID));
        this._players.push(newPlayer);
        this._connectedSockets.add(socket);
        this._playerSockets.set(newPlayer.id, socket);
        newPlayer.videoToken = await this._videoClient.getTokenForTown(this._townID, newPlayer.id);
        this._broadcastEmitter.emit('playerJoined', newPlayer.toPlayerModel());
        socket.on('disconnect', () => {
            this._removePlayer(newPlayer);
            this._connectedSockets.delete(socket);
            this._playerSockets.delete(newPlayer.id);
            this._clearPendingFriendRequestsForPlayer(newPlayer.id);
        });
        socket.on('chatMessage', (message) => {
            this._broadcastEmitter.emit('chatMessage', message);
            this._chatMessages.push(message);
            if (this._chatMessages.length > 200) {
                this._chatMessages.shift();
            }
        });
        socket.on('playerMovement', (movementData) => {
            try {
                this._updatePlayerLocation(newPlayer, movementData);
            }
            catch (err) {
                logError(err);
            }
        });
        socket.on('interactableUpdate', (update) => {
            if (isViewingArea(update)) {
                newPlayer.townEmitter.emit('interactableUpdate', update);
                const viewingArea = this._interactables.find(eachInteractable => eachInteractable.id === update.id);
                if (viewingArea) {
                    viewingArea.updateModel(update);
                }
            }
        });
        socket.on('interactableCommand', (command) => {
            const interactable = this._interactables.find(eachInteractable => eachInteractable.id === command.interactableID);
            if (interactable) {
                try {
                    const payload = interactable.handleCommand(command, newPlayer);
                    socket.emit('commandResponse', {
                        commandID: command.commandID,
                        interactableID: command.interactableID,
                        isOK: true,
                        payload,
                    });
                }
                catch (err) {
                    if (err instanceof InvalidParametersError) {
                        socket.emit('commandResponse', {
                            commandID: command.commandID,
                            interactableID: command.interactableID,
                            isOK: false,
                            error: err.message,
                        });
                    }
                    else {
                        logError(err);
                        socket.emit('commandResponse', {
                            commandID: command.commandID,
                            interactableID: command.interactableID,
                            isOK: false,
                            error: 'Unknown error',
                        });
                    }
                }
            }
            else {
                socket.emit('commandResponse', {
                    commandID: command.commandID,
                    interactableID: command.interactableID,
                    isOK: false,
                    error: `No such interactable ${command.interactableID}`,
                });
            }
        });
        socket.on('sendFriendRequest', (toPlayerID) => {
            this._handleFriendRequest(newPlayer.id, toPlayerID);
        });
        socket.on('respondFriendRequest', (requestID, accept) => {
            this._handleFriendRequestResponse(newPlayer.id, requestID, accept);
        });
        socket.on('updateStatus', (status) => {
            newPlayer.status = status;
            this._broadcastEmitter.emit('playerStatusUpdated', newPlayer.id, status);
            this._broadcastEmitter.emit('playerMoved', newPlayer.toPlayerModel());
        });
        return newPlayer;
    }
    _removePlayer(player) {
        if (player.location.interactableID) {
            this._removePlayerFromInteractable(player);
        }
        this._players = this._players.filter(p => p.id !== player.id);
        this._broadcastEmitter.emit('playerDisconnect', player.toPlayerModel());
    }
    _handleFriendRequest(fromPlayerID, toPlayerID) {
        const fromPlayer = this._players.find(p => p.id === fromPlayerID);
        const toPlayer = this._players.find(p => p.id === toPlayerID);
        if (!fromPlayer || !toPlayer) {
            return;
        }
        if (fromPlayerID === toPlayerID) {
            return;
        }
        if (fromPlayer.isFriend(toPlayerID)) {
            return;
        }
        const existingRequest = Array.from(this._pendingFriendRequests.values())
            .find(req => (req.fromPlayerID === fromPlayerID && req.toPlayerID === toPlayerID) ||
            (req.fromPlayerID === toPlayerID && req.toPlayerID === fromPlayerID));
        if (existingRequest) {
            return;
        }
        const requestID = nanoid();
        this._pendingFriendRequests.set(requestID, {
            fromPlayerID,
            toPlayerID,
            fromPlayerName: fromPlayer.userName,
        });
        const toSocket = this._playerSockets.get(toPlayerID);
        if (toSocket) {
            const notification = {
                fromPlayerID,
                fromPlayerName: fromPlayer.userName,
                requestID,
            };
            console.log(`[Friend Request] Sending notification to ${toPlayerID} from ${fromPlayerID}:`, notification);
            console.log(`[Friend Request] Socket connected: ${toSocket.connected}, Socket ID: ${toSocket.id}`);
            toSocket.emit('friendRequestReceived', notification);
            console.log(`[Friend Request] Event emitted successfully`);
        }
        else {
            console.log(`[Friend Request] ERROR: No socket found for player ${toPlayerID}`);
            console.log(`[Friend Request] Available player sockets:`, Array.from(this._playerSockets.keys()));
            console.log(`[Friend Request] Current players in town:`, this._players.map(p => ({ id: p.id, name: p.userName })));
        }
    }
    _handleFriendRequestResponse(respondingPlayerID, requestID, accept) {
        const request = this._pendingFriendRequests.get(requestID);
        if (!request) {
            return;
        }
        if (request.toPlayerID !== respondingPlayerID) {
            return;
        }
        const fromPlayer = this._players.find(p => p.id === request.fromPlayerID);
        const toPlayer = this._players.find(p => p.id === request.toPlayerID);
        if (!fromPlayer || !toPlayer) {
            this._pendingFriendRequests.delete(requestID);
            return;
        }
        this._pendingFriendRequests.delete(requestID);
        if (accept) {
            fromPlayer.addFriend(toPlayer.id);
            toPlayer.addFriend(fromPlayer.id);
            this._notifyFriendList(fromPlayer.id);
            this._notifyFriendList(toPlayer.id);
        }
        const fromSocket = this._playerSockets.get(request.fromPlayerID);
        if (fromSocket) {
            const update = {
                requestID,
                fromPlayerID: request.fromPlayerID,
                toPlayerID: request.toPlayerID,
                status: accept ? 'accepted' : 'denied',
            };
            fromSocket.emit('friendRequestUpdated', update);
        }
    }
    _clearPendingFriendRequestsForPlayer(playerID) {
        const requestsToRemove = [];
        this._pendingFriendRequests.forEach((request, requestID) => {
            if (request.fromPlayerID === playerID || request.toPlayerID === playerID) {
                requestsToRemove.push(requestID);
            }
        });
        requestsToRemove.forEach(requestID => {
            this._pendingFriendRequests.delete(requestID);
        });
    }
    _notifyFriendList(playerID) {
        const player = this._players.find(p => p.id === playerID);
        if (!player) {
            return;
        }
        const friendIDs = player.getFriends();
        const friends = this._players
            .filter(p => friendIDs.includes(p.id))
            .map(p => p.toPlayerModel());
        const socket = this._playerSockets.get(playerID);
        if (socket) {
            socket.emit('friendListUpdated', friends);
        }
    }
    getFriendsForPlayer(playerID) {
        const player = this._players.find(p => p.id === playerID);
        if (!player) {
            return [];
        }
        const friendIDs = player.getFriends();
        return this._players.filter(p => friendIDs.includes(p.id));
    }
    getPendingFriendRequestsForPlayer(playerID) {
        const requests = [];
        this._pendingFriendRequests.forEach((request, requestID) => {
            if (request.toPlayerID === playerID) {
                requests.push({
                    fromPlayerID: request.fromPlayerID,
                    fromPlayerName: request.fromPlayerName,
                    requestID,
                });
            }
        });
        return requests;
    }
    _updatePlayerLocation(player, location) {
        const prevInteractable = this._interactables.find(conv => conv.id === player.location.interactableID);
        if (!prevInteractable?.contains(location)) {
            if (prevInteractable) {
                prevInteractable.remove(player);
            }
            const newInteractable = this._interactables.find(eachArea => eachArea.isActive && eachArea.contains(location));
            if (newInteractable) {
                newInteractable.add(player);
            }
            location.interactableID = newInteractable?.id;
        }
        else {
            location.interactableID = prevInteractable.id;
        }
        player.location = location;
        this._broadcastEmitter.emit('playerMoved', player.toPlayerModel());
    }
    _removePlayerFromInteractable(player) {
        const area = this._interactables.find(eachArea => eachArea.id === player.location.interactableID);
        if (area) {
            area.remove(player);
        }
    }
    addConversationArea(conversationArea) {
        const area = this._interactables.find(eachArea => eachArea.id === conversationArea.id);
        if (!area || !conversationArea.topic || area.topic) {
            return false;
        }
        area.topic = conversationArea.topic;
        area.addPlayersWithinBounds(this._players);
        this._broadcastEmitter.emit('interactableUpdate', area.toModel());
        return true;
    }
    addViewingArea(viewingArea) {
        const area = this._interactables.find(eachArea => eachArea.id === viewingArea.id);
        if (!area || !viewingArea.video || area.video) {
            return false;
        }
        area.updateModel(viewingArea);
        area.addPlayersWithinBounds(this._players);
        this._broadcastEmitter.emit('interactableUpdate', area.toModel());
        return true;
    }
    getPlayerBySessionToken(token) {
        return this.players.find(eachPlayer => eachPlayer.sessionToken === token);
    }
    getInteractable(id) {
        const ret = this._interactables.find(eachInteractable => eachInteractable.id === id);
        if (!ret) {
            throw new Error(`No such interactable ${id}`);
        }
        return ret;
    }
    getChatMessages(interactableID) {
        return this._chatMessages.filter(eachMessage => eachMessage.interactableID === interactableID);
    }
    disconnectAllPlayers() {
        this._broadcastEmitter.emit('townClosing');
        this._connectedSockets.forEach(eachSocket => eachSocket.disconnect(true));
    }
    initializeFromMap(map) {
        const objectLayer = map.layers.find(eachLayer => eachLayer.name === 'Objects');
        if (!objectLayer) {
            throw new Error(`Unable to find objects layer in map`);
        }
        const viewingAreas = objectLayer.objects
            .filter(eachObject => eachObject.type === 'ViewingArea')
            .map(eachViewingAreaObject => ViewingArea.fromMapObject(eachViewingAreaObject, this._broadcastEmitter));
        const conversationAreas = objectLayer.objects
            .filter(eachObject => eachObject.type === 'ConversationArea')
            .map(eachConvAreaObj => ConversationArea.fromMapObject(eachConvAreaObj, this._broadcastEmitter));
        const gameAreas = objectLayer.objects
            .filter(eachObject => eachObject.type === 'GameArea')
            .map(eachGameAreaObj => GameAreaFactory(eachGameAreaObj, this._broadcastEmitter));
        this._interactables = this._interactables
            .concat(viewingAreas)
            .concat(conversationAreas)
            .concat(gameAreas);
        this._validateInteractables();
    }
    _validateInteractables() {
        const interactableIDs = this._interactables.map(eachInteractable => eachInteractable.id);
        if (interactableIDs.some(item => interactableIDs.indexOf(item) !== interactableIDs.lastIndexOf(item))) {
            throw new Error(`Expected all interactable IDs to be unique, but found duplicate interactable ID in ${interactableIDs}`);
        }
        for (const interactable of this._interactables) {
            for (const otherInteractable of this._interactables) {
                if (interactable !== otherInteractable && interactable.overlaps(otherInteractable)) {
                    throw new Error(`Expected interactables not to overlap, but found overlap between ${interactable.id} and ${otherInteractable.id}`);
                }
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVG93bi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90b3duL1Rvd24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUVoQyxPQUFPLHNCQUFzQixNQUFNLCtCQUErQixDQUFDO0FBRW5FLE9BQU8sTUFBTSxNQUFNLGVBQWUsQ0FBQztBQUNuQyxPQUFPLFdBQVcsTUFBTSxvQkFBb0IsQ0FBQztBQUM3QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBaUI3QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ3BDLE9BQU8sZ0JBQWdCLE1BQU0sb0JBQW9CLENBQUM7QUFDbEQsT0FBTyxlQUFlLE1BQU0seUJBQXlCLENBQUM7QUFFdEQsT0FBTyxXQUFXLE1BQU0sZUFBZSxDQUFDO0FBTXhDLE1BQU0sQ0FBQyxPQUFPLE9BQU8sSUFBSTtJQUN2QixJQUFJLFFBQVE7UUFDVixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDeEIsQ0FBQztJQUVELElBQUksZ0JBQWdCLENBQUMsS0FBYztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO1FBQy9CLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7SUFFRCxJQUFJLGdCQUFnQjtRQUNsQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztJQUNoQyxDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDcEIsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUM7SUFDbEMsQ0FBQztJQUVELElBQUksT0FBTztRQUNULE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN2QixDQUFDO0lBRUQsSUFBSSxTQUFTO1FBQ1gsT0FBTyxJQUFJLENBQUMsT0FBTyxD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