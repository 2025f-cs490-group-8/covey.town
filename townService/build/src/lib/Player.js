import { nanoid } from 'nanoid';
export default class Player {
    location;
    _id;
    _userName;
    _sessionToken;
    _videoToken;
    townEmitter;
    _friends = new Set();
    _status = 'Online';
    constructor(userName, townEmitter) {
        this.location = {
            x: 0,
            y: 0,
            moving: false,
            rotation: 'front',
        };
        this._userName = userName;
        this._id = nanoid();
        this._sessionToken = nanoid();
        this.townEmitter = townEmitter;
    }
    get userName() {
        return this._userName;
    }
    get id() {
        return this._id;
    }
    set videoToken(value) {
        this._videoToken = value;
    }
    get videoToken() {
        return this._videoToken;
    }
    get sessionToken() {
        return this._sessionToken;
    }
    toPlayerModel() {
        return {
            id: this._id,
            location: this.location,
            userName: this._userName,
            status: this._status,
        };
    }
    addFriend(friendID) {
        this._friends.add(friendID);
    }
    removeFriend(friendID) {
        this._friends.delete(friendID);
    }
    isFriend(playerID) {
        return this._friends.has(playerID);
    }
    getFriends() {
        return Array.from(this._friends);
    }
    get status() {
        return this._status;
    }
    set status(value) {
        this._status = value;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGxheWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xpYi9QbGF5ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLFFBQVEsQ0FBQztBQU1oQyxNQUFNLENBQUMsT0FBTyxPQUFPLE1BQU07SUFFbEIsUUFBUSxDQUFpQjtJQUdmLEdBQUcsQ0FBUztJQUdaLFNBQVMsQ0FBUztJQUdsQixhQUFhLENBQVM7SUFHL0IsV0FBVyxDQUFVO0lBR2IsV0FBVyxDQUFjO0lBR2pDLFFBQVEsR0FBa0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUdwQyxPQUFPLEdBQWUsUUFBUSxDQUFDO0lBRXZDLFlBQVksUUFBZ0IsRUFBRSxXQUF3QjtRQUNwRCxJQUFJLENBQUMsUUFBUSxHQUFHO1lBQ2QsQ0FBQyxFQUFFLENBQUM7WUFDSixDQUFDLEVBQUUsQ0FBQztZQUNKLE1BQU0sRUFBRSxLQUFLO1lBQ2IsUUFBUSxFQUFFLE9BQU87U0FDbEIsQ0FBQztRQUNGLElBQUksQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDO1FBQzFCLElBQUksQ0FBQyxHQUFHLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBSSxRQUFRO1FBQ1YsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ3hCLENBQUM7SUFFRCxJQUFJLEVBQUU7UUFDSixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDbEIsQ0FBQztJQUVELElBQUksVUFBVSxDQUFDLEtBQXlCO1FBQ3RDLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO0lBQzNCLENBQUM7SUFFRCxJQUFJLFVBQVU7UUFDWixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDMUIsQ0FBQztJQUVELElBQUksWUFBWTtRQUNkLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQztJQUM1QixDQUFDO0lBRUQsYUFBYTtRQUNYLE9BQU87WUFDTCxFQUFFLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDWixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3hCLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTztTQUNyQixDQUFDO0lBQ0osQ0FBQztJQUtELFNBQVMsQ0FBQyxRQUFrQjtRQUMxQixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBS0QsWUFBWSxDQUFDLFFBQWtCO1FBQzdCLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFLRCxRQUFRLENBQUMsUUFBa0I7UUFDekIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBS0QsVUFBVTtRQUNSLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUtELElBQUksTUFBTTtRQUNSLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUN0QixDQUFDO0lBS0QsSUFBSSxNQUFNLENBQUMsS0FBaUI7UUFDMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFDdkIsQ0FBQztDQUNGIn0=