// The transport owns bytes/encoding/JSON; auth owns command and password policy.
export function readAccountInput(
  input: NodeJS.ReadableStream,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("error", onError);
      input.removeListener("close", onClose);
    };
    const onError = () => {
      cleanup();
      input.pause();
      reject(new Error("Invalid account input"));
    };
    const onClose = () => onError();
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      size += bytes.length;
      if (size > 16384) return onError();
      chunks.push(bytes);
    };
    const onEnd = () => {
      cleanup();
      try {
        const value: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        );
        if (typeof value !== "object" || value === null || Array.isArray(value))
          throw new Error("Invalid account input");
        resolve(value);
      } catch {
        reject(new Error("Invalid account input"));
      }
    };
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onError);
    input.once("close", onClose);
  });
}
