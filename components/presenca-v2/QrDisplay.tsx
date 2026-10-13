import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

type QrDisplayProps = {
  value: string;
  title: string;
  subtitle?: string;
  onClose?: () => void;
};

const QrDisplay: React.FC<QrDisplayProps> = ({ value, title, subtitle, onClose }) => {
  const svg = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    return code.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
  }, [value]);

  return (
    <div className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center bg-slate-950/90 p-4">
      <section className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Check-in da reunião</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
              Fechar
            </button>
          )}
        </div>

        <div className="mx-auto mt-7 w-full max-w-[520px] rounded-3xl bg-white p-4 sm:p-8">
          <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>

        <div className="mt-5 text-center">
          <p className="text-lg font-black text-slate-900">Aponte a câmera do celular para o QR Code</p>
          <p className="mt-1 text-sm text-slate-600">O QR já identifica esta sessão. O participante não precisa escolher reunião ou círculo.</p>
          <p className="mx-auto mt-4 max-w-2xl break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{value}</p>
        </div>
      </section>
    </div>
  );
};

export default QrDisplay;
