import React, { useCallback, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, FileJson, X } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (base64: string, mimeType: string) => void;
  onClear?: () => void;
  isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, onClear, isLoading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    const validTypes = ['application/pdf', 'application/json'];
    
    if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
      setError('Por favor carregue um ficheiro PDF, JSON ou Imagem (JPG, PNG).');
      return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('O ficheiro é demasiado grande. Máximo 5MB.');
      return;
    }

    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Extract base64 content
      const base64Data = result.split(',')[1];
      onFileSelect(base64Data, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFileName(null);
    if (onClear) {
      onClear();
    }
  };

  const isJson = fileName?.toLowerCase().endsWith('.json');

  return (
    <div className="w-full">
      <div 
        className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl transition-all duration-300 ${
          dragActive 
            ? 'border-emerald-500 bg-emerald-50' 
            : 'border-slate-300 bg-white hover:bg-slate-50'
        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {/* Remove Button */}
        {!isLoading && fileName && (
          <button
            onClick={handleRemove}
            className="absolute top-3 right-3 p-1.5 bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full shadow-sm border border-slate-200 transition-all z-10"
            title="Remover ficheiro"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          {isLoading ? (
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mb-3"></div>
          ) : fileName ? (
            isJson ? (
              <FileJson className="w-10 h-10 text-emerald-500 mb-3" />
            ) : (
              <CheckCircle className="w-10 h-10 text-emerald-500 mb-3" />
            )
          ) : (
            <Upload className="w-10 h-10 text-slate-400 mb-3" />
          )}
          
          <p className="mb-2 text-sm text-slate-500">
            {isLoading ? (
              <span className="font-semibold text-emerald-600">A processar ficheiro...</span>
            ) : fileName ? (
              <span className="font-medium text-emerald-600">Ficheiro selecionado: {fileName}</span>
            ) : (
              <>
                <span className="font-semibold">Clique para carregar</span> ou arraste e largue
              </>
            )}
          </p>
          {!isLoading && !fileName && (
            <p className="text-xs text-slate-400">Fatura (PDF/Img) ou Simulação (.json)</p>
          )}
        </div>
        <input 
          id="dropzone-file" 
          type="file" 
          className="hidden" 
          accept="application/pdf,application/json,image/*"
          onChange={handleChange}
          disabled={isLoading}
        />
        <label 
          htmlFor="dropzone-file" 
          className="absolute inset-0 w-full h-full cursor-pointer"
        ></label>
      </div>
      {error && (
        <div className="flex items-center mt-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </div>
      )}
    </div>
  );
};