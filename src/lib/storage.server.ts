import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import mime from "@/utils/mime";

const root = resolve(process.env.STORAGE_PATH || ".storage");
export function buildObjectKey(directory: "audio" | "covers" | "exports", type: string) {
  const extension = mime.getExtension(type);
  return `${directory}/${randomUUID()}${extension ? `.${extension}` : ""}`;
}
export function storageFile(key: string) {
  if (!/^(?:audio|covers|exports)\/[a-f0-9-]{36}(?:\.[a-z0-9]+)?$/i.test(key))
    throw new Error("无效的文件路径");
  return resolve(root, key);
}
export async function uploadObject(key: string, bytes: Buffer) {
  const path = storageFile(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}
export async function uploadStream(key: string, stream: Readable) {
  const path = storageFile(key);
  await mkdir(dirname(path), { recursive: true });
  const output = createWriteStream(path, { flags: "wx" });
  try {
    await pipeline(stream, output);
    return output.bytesWritten;
  } catch (error) {
    await deleteObject(key);
    throw error;
  }
}
export function deleteObject(key: string) {
  return rm(storageFile(key), { force: true });
}
