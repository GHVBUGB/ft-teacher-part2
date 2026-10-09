/** Browser recording failures are distinct from microphone permission denial. */
export function microphoneErrorMessage(error: unknown): string | null {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return '系统未检测到麦克风。请连接录音设备后重试。';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return '浏览器未获麦克风权限。请在此网站的设置中允许麦克风后重试。';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return '麦克风无法读取。请检查设备连接，关闭其他正在使用麦克风的应用后重试。';
  return null;
}
