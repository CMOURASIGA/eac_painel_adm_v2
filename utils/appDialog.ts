export type AppDialogTone = 'info' | 'success' | 'error' | 'warning';

export type AppAlertDialogRequest = {
  kind: 'alert';
  title?: string;
  message: string;
  tone?: AppDialogTone;
  confirmLabel?: string;
};

export type AppConfirmDialogRequest = {
  kind: 'confirm';
  title?: string;
  message: string;
  tone?: AppDialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type AppDialogRequest = AppAlertDialogRequest | AppConfirmDialogRequest;

type DialogHandler = (request: AppDialogRequest) => Promise<boolean | void>;

let dialogHandler: DialogHandler | null = null;

const nativeAlert =
  typeof window !== 'undefined' && typeof window.alert === 'function'
    ? window.alert.bind(window)
    : null;

const nativeConfirm =
  typeof window !== 'undefined' && typeof window.confirm === 'function'
    ? window.confirm.bind(window)
    : null;

export function registerAppDialogHandler(handler: DialogHandler | null) {
  dialogHandler = handler;
}

export async function showAppAlert(
  input: Omit<AppAlertDialogRequest, 'kind'> | string
): Promise<void> {
  const request: AppAlertDialogRequest =
    typeof input === 'string' ? { kind: 'alert', message: input } : { kind: 'alert', ...input };

  if (!dialogHandler) {
    if (nativeAlert) nativeAlert(request.message);
    return;
  }

  await dialogHandler(request);
}

export async function showAppConfirm(
  input: Omit<AppConfirmDialogRequest, 'kind'> | string
): Promise<boolean> {
  const request: AppConfirmDialogRequest =
    typeof input === 'string'
      ? { kind: 'confirm', message: input }
      : { kind: 'confirm', ...input };

  if (!dialogHandler) {
    return nativeConfirm ? nativeConfirm(request.message) : false;
  }

  const result = await dialogHandler(request);
  return Boolean(result);
}

export function installWindowAlertBridge() {
  if (typeof window === 'undefined') return () => {};
  const originalAlert = window.alert.bind(window);

  window.alert = (message?: any) => {
    void showAppAlert({ message: String(message ?? '') });
  };

  return () => {
    window.alert = originalAlert;
  };
}
