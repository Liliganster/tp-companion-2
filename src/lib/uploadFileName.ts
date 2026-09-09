// Match the server's path restrictions before creating a job or uploading a file.
export function isSupportedUploadFileName(name: string): boolean {
  return Boolean(name) && name === name.trim() && name !== "." && name !== ".." &&
    !/[\\/%?#]/.test(name) &&
    !Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}
