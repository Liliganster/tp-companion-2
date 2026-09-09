export {};
declare global {
  interface Window {
    __appRecovery?: {
      show: () => void;
      recover: () => Promise<void>;
      ready: () => void;
    };
  }
}
