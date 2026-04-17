import React from 'react';

interface MarkdownViewerProps {
  content: string;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  // Simple markdown-to-html logic for display with Link support
  const formatted = content
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-bold hover:underline underline-offset-4 inline-flex items-center"><span>$1</span><svg class="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg></a>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded font-mono text-blue-600">$1</code>')
    .replace(/^\d\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>');

  return (
    <div 
      className="prose prose-sm max-w-none text-slate-700 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: formatted }}
    />
  );
};

export default MarkdownViewer;