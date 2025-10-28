// Gemini text extraction
import { getSelectors } from './checks.js';
import { toMarkdownIfHtml } from './markdown.js';

export function extractSingleMessage(messageElement) {
  try {
    const selectors = getSelectors();
    let contentEl = messageElement.querySelector(selectors.content) || messageElement;
    const cloned = contentEl.cloneNode(true);
    cloned.querySelectorAll && cloned.querySelectorAll('.chatvault-save-btn').forEach(el => el.remove());
    const html = (cloned.innerHTML || '').trim();
    const raw = html || (cloned.textContent || '').trim();
    
    // code-immersive-panelの場合は特別な処理
    const codeImmersivePanel = messageElement.closest('code-immersive-panel');
    if (codeImmersivePanel) {
      return extractCodeImmersivePanelContent(codeImmersivePanel);
    }
    
    const content = html ? toMarkdownIfHtml(html) : raw;

    // Geminiのメッセージ要素からロールを判定
    let role = 'assistant'; // デフォルトはアシスタント（Geminiの応答）
    
    // ユーザーメッセージかどうかを判定
    if (messageElement.matches && messageElement.matches(selectors.userMessage)) {
      role = 'user';
    } else {
      // 子要素にユーザーメッセージがあるかチェック
      const userMessageEl = messageElement.querySelector(selectors.userMessage);
      if (userMessageEl) {
        role = 'user';
      }
    }

    const title = document.title
      .replace(' | Gemini', '')
      .replace(' - Gemini', '')
      .replace(' | Google AI Studio', '')
      .replace(' - Google AI Studio', '');

    return { role, content, title };
  } catch (_) {
    const text = messageElement.textContent || messageElement.innerText || '';
    let role = 'assistant';
    
    // フォールバックでのロール判定
    if (messageElement.matches && messageElement.matches(selectors.userMessage)) {
      role = 'user';
    } else {
      const userMessageEl = messageElement.querySelector(selectors.userMessage);
      if (userMessageEl) {
        role = 'user';
      }
    }
    
    const title = document.title
      .replace(' | Gemini', '')
      .replace(' - Gemini', '')
      .replace(' | Google AI Studio', '')
      .replace(' - Google AI Studio', '');
      
    return { role, content: text, title };
  }
}

export function captureMessages(mode, count = null) {
  const selectors = getSelectors();
  
  // 通常のメッセージを取得
  const normalMessages = Array.from(document.querySelectorAll(selectors.container)).map((msg) => {
    const contentEl = msg.querySelector(selectors.content);
    
    // ロールを判定
    let role = 'assistant';
    if (msg.matches && msg.matches(selectors.userMessage)) {
      role = 'user';
    } else {
      const userMessageEl = msg.querySelector(selectors.userMessage);
      if (userMessageEl) {
        role = 'user';
      }
    }
    
    const html = contentEl ? contentEl.innerHTML : '';
    return {
      speaker: role === 'user' ? 'User' : 'Assistant',
      content: html ? toMarkdownIfHtml(html) : (contentEl?.textContent?.trim() || '')
    };
  });
  
  // code-immersive-panelのメッセージを取得
  const codeImmersiveMessages = Array.from(document.querySelectorAll('code-immersive-panel')).map((panel) => {
    const result = extractCodeImmersivePanelContent(panel);
    return {
      speaker: 'Assistant',
      content: result.content
    };
  });
  
  // 両方のメッセージを結合
  const allMessages = [...normalMessages, ...codeImmersiveMessages];

  let messages = allMessages;
  if (mode === 'recent' && count) {
    messages = allMessages.slice(-count);
  } else if (mode === 'selected') {
    messages = allMessages;
  } else if (mode !== 'all' && mode !== 'recent') {
    throw new Error('無効なキャプチャモード: ' + mode);
  }

  const title = document.title
    .replace(' | Gemini', '')
    .replace(' - Gemini', '')
    .replace(' | Google AI Studio', '')
    .replace(' - Google AI Studio', '');

  return { success: true, messages, title };
}

/**
 * code-immersive-panelからコードコンテンツを抽出する特別な処理
 * @param {HTMLElement} codeImmersivePanel - code-immersive-panel要素
 * @returns {Object} 抽出されたコンテンツ情報
 */
function extractCodeImmersivePanelContent(codeImmersivePanel) {
  try {
    // タイトルを取得（ツールバーのタイトルから）
    const titleElement = codeImmersivePanel.querySelector('.title-text');
    const title = titleElement ? titleElement.textContent.trim() : 'Code';
    
    // コードエディタからコードを取得
    const codeEditor = codeImmersivePanel.querySelector('[data-test-id="code-editor"]');
    let codeContent = '';
    
    if (codeEditor) {
      // Monacoエディタのtextareaからコードを取得（最優先）
      const textarea = codeEditor.querySelector('textarea');
      if (textarea && textarea.value) {
        codeContent = textarea.value;
      } else {
        // Monacoエディタのview-linesからコードを取得（重複を避ける）
        const viewLines = codeEditor.querySelector('.view-lines');
        if (viewLines) {
          // 各行のテキストを取得して結合
          const lines = Array.from(viewLines.querySelectorAll('.view-line'));
          const extractedLines = [];
          
          for (const line of lines) {
            // 行内のテキストコンテンツを取得
            const textContent = line.textContent || '';
            // 空行でない場合のみ追加
            if (textContent.trim()) {
              extractedLines.push(textContent);
            }
          }
          
          codeContent = extractedLines.join('\n');
          
          // 重複チェックと除去
          if (codeContent) {
            codeContent = removeDuplicateLines(codeContent);
          }
        } else {
          // 最後のフォールバック: Monacoエディタのモデルから取得を試行
          const monacoEditor = codeEditor.querySelector('.monaco-editor');
          if (monacoEditor) {
            // Monacoエディタのモデルから直接取得を試行
            try {
              // Monacoエディタのグローバルオブジェクトからモデルを取得
              if (window.monaco && window.monaco.editor) {
                const editors = window.monaco.editor.getEditors();
                for (const editor of editors) {
                  const model = editor.getModel();
                  if (model && model.getValue) {
                    codeContent = model.getValue();
                    break;
                  }
                }
              }
            } catch (e) {
              console.warn('Monaco editor model access failed:', e);
            }
          }
          
          // それでも取得できない場合は、コードエディタ全体のテキストから重複を除去
          if (!codeContent) {
            const fullText = codeEditor.textContent || '';
            // 重複した行を除去する処理
            codeContent = removeDuplicateLines(fullText);
          }
        }
      }
    }
    
    // 言語を判定（タイトルから推測）
    let language = '';
    if (title.toLowerCase().includes('python')) {
      language = 'python';
    } else if (title.toLowerCase().includes('javascript') || title.toLowerCase().includes('js')) {
      language = 'javascript';
    } else if (title.toLowerCase().includes('typescript') || title.toLowerCase().includes('ts')) {
      language = 'typescript';
    } else if (title.toLowerCase().includes('html')) {
      language = 'html';
    } else if (title.toLowerCase().includes('css')) {
      language = 'css';
    } else if (title.toLowerCase().includes('java')) {
      language = 'java';
    } else if (title.toLowerCase().includes('c++') || title.toLowerCase().includes('cpp')) {
      language = 'cpp';
    } else if (title.toLowerCase().includes('c#')) {
      language = 'csharp';
    } else if (title.toLowerCase().includes('go')) {
      language = 'go';
    } else if (title.toLowerCase().includes('rust')) {
      language = 'rust';
    } else if (title.toLowerCase().includes('php')) {
      language = 'php';
    } else if (title.toLowerCase().includes('ruby')) {
      language = 'ruby';
    } else if (title.toLowerCase().includes('swift')) {
      language = 'swift';
    } else if (title.toLowerCase().includes('kotlin')) {
      language = 'kotlin';
    } else if (title.toLowerCase().includes('scala')) {
      language = 'scala';
    } else if (title.toLowerCase().includes('r')) {
      language = 'r';
    } else if (title.toLowerCase().includes('matlab')) {
      language = 'matlab';
    } else if (title.toLowerCase().includes('sql')) {
      language = 'sql';
    } else if (title.toLowerCase().includes('bash') || title.toLowerCase().includes('shell')) {
      language = 'bash';
    } else if (title.toLowerCase().includes('yaml') || title.toLowerCase().includes('yml')) {
      language = 'yaml';
    } else if (title.toLowerCase().includes('json')) {
      language = 'json';
    } else if (title.toLowerCase().includes('xml')) {
      language = 'xml';
    } else if (title.toLowerCase().includes('markdown') || title.toLowerCase().includes('md')) {
      language = 'markdown';
    }
    
    // コードの前処理（重複除去と整形）
    if (codeContent) {
      // 重複行を除去
      codeContent = removeDuplicateLines(codeContent);
      // 前後の空白を除去
      codeContent = codeContent.trim();
    }
    
    // コードをMarkdown形式で整形
    const formattedCode = `\`\`\`${language}\n${codeContent}\n\`\`\``;
    
    // ページタイトルを取得
    const pageTitle = document.title
      .replace(' | Gemini', '')
      .replace(' - Gemini', '')
      .replace(' | Google AI Studio', '')
      .replace(' - Google AI Studio', '');
    
    return {
      role: 'assistant',
      content: formattedCode,
      title: pageTitle
    };
  } catch (error) {
    console.error('Error extracting code-immersive-panel content:', error);
    
    // フォールバック: 基本的なテキスト抽出
    const fallbackContent = codeImmersivePanel.textContent || '';
    const pageTitle = document.title
      .replace(' | Gemini', '')
      .replace(' - Gemini', '')
      .replace(' | Google AI Studio', '')
      .replace(' - Google AI Studio', '');
    
    return {
      role: 'assistant',
      content: fallbackContent,
      title: pageTitle
    };
  }
}

/**
 * 重複した行を除去する関数
 * @param {string} text - 重複が含まれる可能性のあるテキスト
 * @returns {string} 重複を除去したテキスト
 */
function removeDuplicateLines(text) {
  if (!text) return '';
  
  // テキストを行に分割
  const lines = text.split('\n');
  const uniqueLines = [];
  const seenLines = new Set();
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    // 空行や重複行をスキップ
    if (trimmedLine && !seenLines.has(trimmedLine)) {
      uniqueLines.push(line);
      seenLines.add(trimmedLine);
    }
  }
  
  return uniqueLines.join('\n');
}

// 関数をエクスポート
export { extractCodeImmersivePanelContent };
