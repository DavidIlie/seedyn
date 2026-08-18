import { handleMachineUpload } from "~/server/http/upload-route";
import {
  uploadMethodNotAllowed,
  uploadOptions,
} from "~/server/http/upload-route-methods";

export const maxDuration = 120;
export const DELETE = uploadMethodNotAllowed;
export const GET = uploadMethodNotAllowed;
export const HEAD = uploadMethodNotAllowed;
export const OPTIONS = uploadOptions;
export const PATCH = uploadMethodNotAllowed;
export const PUT = uploadMethodNotAllowed;

export async function POST(request: Request): Promise<Response> {
  return handleMachineUpload(request, {
    fileField: "file",
    forcedKind: "file",
    legacy: true,
  });
}
