import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';

interface FileSelectorProps {
  selectedFile: File | null;
  isStreaming: boolean;
  streamQuality: 'low' | 'medium' | 'high';
  onFileSelect: (file: File) => void;
}

export const FileSelector = ({ 
  selectedFile, 
  isStreaming, 
  streamQuality,
  onFileSelect 
}: FileSelectorProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setStreamQuality } = useFileStreamingStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      // 파일 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex items-center gap-4">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        accept="video/*,application/pdf,image/*,text/*"
      />
      <Button 
        onClick={() => fileInputRef.current?.click()}
        variant="outline"
        disabled={isStreaming}
      >
        Select File
      </Button>
      
      {selectedFile && (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm font-medium truncate">{selectedFile.name}</span>
          <span className="text-xs text-muted-foreground">
            ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
          </span>
        </div>
      )}
      
      {/* Quality Selector */}
      <div className="flex items-center gap-2">
        <Label className="text-sm">Quality:</Label>
        <select
          value={streamQuality}
          onChange={(e) => setStreamQuality(e.target.value as any)}
          className="px-2 py-1 text-sm border rounded"
          disabled={isStreaming}
        >
          <option value="low">Low (15fps)</option>
          <option value="medium">Medium (24fps)</option>
          <option value="high">High (30fps)</option>
        </select>
      </div>
    </div>
  );
};
