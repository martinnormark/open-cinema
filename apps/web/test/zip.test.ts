import { describe, expect, it } from "bun:test";
import { crc32, readZip, zipStream, ZipError } from "../src/lib/zip";

async function archive(entries: Record<string, Uint8Array | null>) {
  const missing: string[] = [];
  const stream = zipStream(
    Object.entries(entries).map(([name, bytes]) => ({
      name,
      open: async () =>
        bytes &&
        new ReadableStream<Uint8Array>({
          start(controller) {
            // Two chunks, so the CRC is carried across reads.
            controller.enqueue(bytes.slice(0, 3));
            controller.enqueue(bytes.slice(3));
            controller.close();
          },
        }),
    })),
    { onMissing: (name) => missing.push(name) },
  );
  return { blob: await new Response(stream).blob(), missing };
}

describe("world zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("streams entries that read back unchanged, skipping missing ones", async () => {
    const video = crypto.getRandomValues(new Uint8Array(70_000));
    const { blob, missing } = await archive({
      "world.json": new TextEncoder().encode('{"format":"open-cinema.world"}'),
      "media/gone.png": null,
      "media/clip.mp4": video,
    });
    expect(missing).toEqual(["media/gone.png"]);
    const entries = await readZip(blob);
    expect(entries.map((e) => e.name)).toEqual([
      "world.json",
      "media/clip.mp4",
    ]);
    expect(await (await entries[0]!.blob()).text()).toContain("open-cinema");
    expect(
      new Uint8Array(await (await entries[1]!.blob()).arrayBuffer()),
    ).toEqual(video);
  });

  it("reports a damaged entry and a file that is not a zip", async () => {
    const { blob } = await archive({
      "a.txt": new TextEncoder().encode("hello world"),
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Flip a byte of the stored data (after the 30-byte header and name).
    bytes[30 + "a.txt".length + 2]! ^= 0xff;
    const [entry] = await readZip(new Blob([bytes]));
    await expect(entry!.blob()).rejects.toThrow(/damaged/);
    await expect(readZip(new Blob(["not a zip"]))).rejects.toBeInstanceOf(
      ZipError,
    );
  });
});
