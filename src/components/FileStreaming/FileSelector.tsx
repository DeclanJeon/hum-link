import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, FileVideo, FileImage, FileText, File, X } from 'lucide-react';
import { useFileStreamingStore } from '@/stores/useFileStreamingStore';
import { VideoLoader } from '@/services/videoLoader';
import { toast } from 'sonner';

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
  const [isDragging, setIsDragging] = useState(false);
  const { setStreamQuality, setSelectedFile } = useFileStreamingStore();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSelectFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const validateAndSelectFile = (file: File) => {
    // 파일 크기 제한 제거 - 경고만 표시
    const warnSize = 1024 * 1024 * 1024; // 1GB
    if (file.size > warnSize) {
      toast.warning(`Large file detected (${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB). Streaming may take time.`);
    }
    
    // 비디오 파일 검증
    if (file.type.startsWith('video/')) {
      const validation = VideoLoader.validateFile(file);
      if (!validation.valid) {
        // 경고만 표시하고 계속 진행
        toast.warning(validation.error || 'This video format may not be fully supported');
      }
    }
    
    // 지원 파일 타입 확인
    const supportedTypes = [
      'video/', 'application/pdf', 'image/', 'text/'
    ];
    
    const isSupported = supportedTypes.some(type => 
      file.type.startsWith(type) || file.type === type
    );
    
    if (!isSupported) {
      toast.warning('This file type may not be fully supported');
    }
    
    onFileSelect(file);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && !isStreaming) {
      validateAndSelectFile(file);
    }
  };
  
  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/')) return <FileVideo className="w-4 h-4" />;
    if (file.type.startsWith('image/')) return <FileImage className="w-4 h-4" />;
    if (file.type === 'application/pdf') return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };
  
  const getFileTypeLabel = (file: File) => {
    if (file.type.startsWith('video/')) return 'Video';
    if (file.type.startsWith('image/')) return 'Image';
    if (file.type === 'application/pdf') return 'PDF';
    if (file.type.startsWith('text/')) return 'Text';
    return 'File';
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  return (
    <div className="space-y-4">
      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}
          ${isStreaming ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'}
        `}
        onClick={() => !isStreaming && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept="video/*,application/pdf,image/*,text/*"
          disabled={isStreaming}
        />
        
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragging ? 'Drop file here' : 'Click to select or drag and drop'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Supports video, PDF, images, and text files
        </p>
      </div>
      
      {/* Selected File Display */}
      {selectedFile && (
        <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-center gap-2 flex-1">
            {getFileIcon(selectedFile)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {getFileTypeLabel(selectedFile)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </span>
              </div>
            </div>
          </div>
          
          {!isStreaming && (
            <Button
              onClick={clearFile}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
      
      {/* Quality Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Label className="text-sm">Stream Quality:</Label>
          <select
            value={streamQuality}
            onChange={(e) => setStreamQuality(e.target.value as any)}
            className="px-3 py-1 text-sm border rounded-md bg-background"
            disabled={isStreaming}
          >
            <option value="low">Low (15fps, 480p)</option>
            <option value="medium">Medium (24fps, 720p)</option>
            <option value="high">High (30fps, 1080p)</option>
          </select>
        </div>
        
        {/* Quality Info */}
        <div className="text-xs text-muted-foreground">
          {streamQuality === 'low' && 'Best for slow connections'}
          {streamQuality === 'medium' && 'Balanced quality and performance'}
          {streamQuality === 'high' && 'Best quality, requires good connection'}
        </div>
      </div>
    </div>
  );
};
