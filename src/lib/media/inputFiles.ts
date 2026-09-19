type FileInputLike = { files: ArrayLike<File> | null; value: string };

/**
 * Snapshot the selection of a file input and reset it so the same file can be
 * picked again. `input.files` is a live FileList: browsers empty it when
 * `value` is cleared, so it must be copied BEFORE the reset.
 */
export function takeInputFiles(input: FileInputLike): File[] {
  const selected = input.files ? Array.from(input.files) : [];
  input.value = '';
  return selected;
}
