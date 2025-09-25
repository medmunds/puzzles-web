export const workerUnhandledErrorMessageType = "worker-unhandlederror";

export interface WorkerUnhandledErrorMessage {
  type: typeof workerUnhandledErrorMessageType;
  message: string;
  error?: Error;
}
