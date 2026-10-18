export type SocketData<Data extends object> = {
    type: string;
    clientId?: string;
    data: Data;
};