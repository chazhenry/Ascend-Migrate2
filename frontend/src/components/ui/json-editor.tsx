import { useEffect, useRef, type JSX } from "react";
import JSONEditor, { type JSONEditorMode, type JSONEditorOptions } from "jsoneditor";
import "jsoneditor/dist/jsoneditor.css";

interface JsonEditorProps {
    text: string;
    readOnly?: boolean;
    onTextChange?: (text: string) => void;
    onError?: (message: string | null) => void;
}

export const JsonEditor = ({ text, readOnly = false, onTextChange, onError }: JsonEditorProps): JSX.Element => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<JSONEditor | null>(null);
    const hasText = text.trim().length > 0;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const options: JSONEditorOptions = {
            mode: readOnly ? "view" : "tree",
            modes: readOnly ? ["view", "code"] : ["tree", "code"],
            mainMenuBar: true,
            navigationBar: true,
            statusBar: true,
            search: true,
            history: !readOnly,
            indentation: 2,
            onEditable: () => !readOnly,
            onChangeText: (nextText) => {
                onError?.(null);
                onTextChange?.(nextText);
            },
            onChangeJSON: (nextJson) => {
                onError?.(null);
                onTextChange?.(JSON.stringify(nextJson, null, 2));
            },
            onError: (error) => {
                onError?.(error.message);
            },
            onModeChange: (newMode: JSONEditorMode) => {
                if (readOnly && newMode === "code") {
                    try {
                        editorRef.current?.setText(text);
                    } catch {
                        // Keep the editor usable even if the external text somehow becomes invalid.
                    }
                }
            },
        };

        const editor = new JSONEditor(container, options);
        editorRef.current = editor;

        if (hasText) {
            editor.setText(text);
        }

        return () => {
            editor.destroy();
            editorRef.current = null;
        };
    }, [hasText, readOnly, text]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) {
            return;
        }

        if (!hasText) {
            return;
        }

        const currentText = editor.getText();
        if (currentText !== text) {
            try {
                editor.updateText(text);
            } catch {
                editor.setText(text);
            }
        }
    }, [hasText, text]);

    return <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden rounded-md [&_.jsoneditor]:h-full [&_.jsoneditor]:border-0 [&_.jsoneditor]:font-mono [&_.jsoneditor-menu]:border-b-border [&_.jsoneditor-menu]:bg-background [&_.jsoneditor-navigation-bar]:border-b-border [&_.jsoneditor-navigation-bar]:bg-background [&_.jsoneditor-statusbar]:border-t-border [&_.jsoneditor-statusbar]:bg-background" />;
};