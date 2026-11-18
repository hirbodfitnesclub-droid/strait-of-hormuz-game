import { isNativeRuntime } from './runtime';

/** System share sheet on Android; download for the development preview. */
export async function exportJson(filename: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value, null, 2);
  if (isNativeRuntime()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const file = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'تنگه هرمز', files: [file.uri], dialogTitle: 'ذخیره یا اشتراک فایل بازی' });
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
