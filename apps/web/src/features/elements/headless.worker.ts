import { headlessPng } from "./headless";

// The app compiles against DOM types; this is a dedicated worker's scope.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Blob>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (event) => {
  headlessPng(event.data).then(
    (done) => scope.postMessage(done),
    (error: unknown) =>
      scope.postMessage({
        error:
          error instanceof Error
            ? error.message
            : "The sheet could not be edited.",
      }),
  );
};
