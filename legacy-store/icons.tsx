import React from 'react';
type Props=React.SVGProps<SVGSVGElement>&{size?:number|string;strokeWidth?:number};
const paths:Record<string,string>={
 ClipboardCopy:'M8 4H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2 M8 2h8v5H8z M16 12h6m-3-3v6',
 Download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
 LogOut:'M9 4H4v16h5m4-4 4-4-4-4m4 4H8',
 PackagePlus:'M3 7 12 2l9 5v10l-9 5-9-5z M3 7l9 5 9-5m-9 5v10 M16 4v6m-3-3h6',
 Pencil:'M3 17 17 3l4 4L7 21H3z',
 RefreshCw:'M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6 M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6',
 Search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16m6-2 5 5',
 Trash2:'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 10v7m4-7v7',
 X:'M18 6 6 18M6 6l12 12',
 CheckCircle2:'M22 11a10 10 0 1 1-6-9 M8 11l3 3 9-9',
 CircleHelp:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4v.1',
 FileCheck2:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 15l3 3 5-5',
 Paperclip:'m21 11-8 8a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-2-2l8-8',
 Shirt:'M8 3 5 5 2 7l3 5 3-1v10h8V11l3 1 3-5-3-2-3-2a4 4 0 0 1-8 0z',
 Upload:'M12 16V3m-5 5 5-5 5 5 M4 17v4h16v-4'
};
function make(name:string){return function Icon({size=24,strokeWidth=2,children,...props}:Props){return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]||paths.CircleHelp}/>{children}</svg>}}
export const ClipboardCopy=make('ClipboardCopy'),Download=make('Download'),LogOut=make('LogOut'),PackagePlus=make('PackagePlus'),Pencil=make('Pencil'),RefreshCw=make('RefreshCw'),Search=make('Search'),Trash2=make('Trash2'),X=make('X'),CheckCircle2=make('CheckCircle2'),CircleHelp=make('CircleHelp'),FileCheck2=make('FileCheck2'),Paperclip=make('Paperclip'),Shirt=make('Shirt'),Upload=make('Upload');
