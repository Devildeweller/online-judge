import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';
import type { Language } from '../types';
import { useTheme } from './theme';

const EXTENSIONS = {
  CPP: () => cpp(),
  PYTHON: () => python(),
  JAVA: () => java(),
  JAVASCRIPT: () => javascript(),
} satisfies Record<Language, () => unknown>;

interface Props {
  language: Language;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** CSS height; omit to fill the parent (the parent must have a fixed height). */
  height?: string;
}

export function CodeEditor({ language, value, onChange, readOnly = false, height }: Props) {
  const { theme } = useTheme();
  const extensions = useMemo(() => [EXTENSIONS[language]()], [language]);
  return (
    <CodeMirror
      value={value}
      height={height ?? '100%'}
      theme={theme}
      extensions={extensions}
      editable={!readOnly}
      readOnly={readOnly}
      onChange={onChange}
      basicSetup={{ tabSize: 4, highlightActiveLine: !readOnly, highlightActiveLineGutter: !readOnly }}
      aria-label="Source code editor"
    />
  );
}
