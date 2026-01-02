<?php
// includes/views/admin/playground.php
?>
<section class="glass p-1 rounded-sm h-[calc(100vh-10rem)] flex flex-col border border-emerald-500/30 relative overflow-hidden">
    <!-- Terminal Header -->
    <div class="bg-emerald-900/20 border-b border-emerald-500/20 p-2 flex justify-between items-center px-4">
        <div class="flex gap-4 items-center">
            <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-rose-500/50"></div>
                <div class="w-3 h-3 rounded-full bg-amber-500/50"></div>
                <div class="w-3 h-3 rounded-full bg-emerald-500/50"></div>
            </div>
            <div class="text-xs font-mono text-emerald-500/80">user@smolorchestrator:~/playground</div>
            <div id="pg-provider-display" class="text-xs font-mono text-cyan-500/80 uppercase tracking-widest hidden border-l border-emerald-500/20 pl-4"></div>
            <div id="pg-error-display" class="text-xs font-mono text-rose-500 uppercase tracking-widest hidden border-l border-rose-500/20 pl-4 animate-pulse"></div>
        </div>
        <div class="flex gap-2 text-[10px] font-mono">
            <select id="pg-endpoint" class="bg-black border border-emerald-500/30 text-emerald-400 rounded px-2 py-1 outline-none focus:border-emerald-400">
                <?php foreach ($data['endpoints'] as $e) echo "<option value='{$e['name']}'>./{$e['name']}</option>"; ?>
            </select>
            <input id="pg-key" placeholder="API_KEY (OPTIONAL)" class="bg-black border border-emerald-500/30 text-emerald-400 rounded px-2 py-1 outline-none focus:border-emerald-400 w-32 placeholder-emerald-800">
            
            <!-- Thinking Controls -->
            <select id="pg-reasoning" title="Only works with Gemini providers" class="bg-black border border-emerald-500/30 text-amber-500 rounded px-2 py-1 outline-none focus:border-amber-500">
                <option value="disabled">Think: Off</option>
                <option value="minimal">Effort: Minimal</option>
                <option value="low">Effort: Low</option>
                <option value="medium">Effort: Medium</option>
                <option value="high">Effort: High</option>
            </select>

            <button id="pg-tools-btn" class="bg-black border border-emerald-500/30 text-cyan-500 rounded px-2 py-1 hover:border-cyan-500 transition-colors uppercase">Tools</button>

            <label class="flex items-center gap-2 cursor-pointer select-none border border-emerald-500/30 px-2 rounded hover:bg-emerald-500/10 transition-colors">
                <input type="checkbox" id="pg-stream" checked class="accent-emerald-500">
                <span class="text-emerald-400">STREAM</span>
            </label>
        </div>
    </div>
    
    <!-- Terminal Body -->
    <div id="chat-history" class="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm scroll-smooth">
        <div class="text-emerald-500/50 text-xs mb-4">
            Welcome to SmolOrchestrator Terminal v1.0<br>
            Type your prompt below to initialize model interaction...
        </div>
    </div>
    
    <!-- Input Area -->
    <div class="relative p-4 bg-black/40 border-t border-emerald-500/20">
        <!-- Queue Display -->
        <div id="pg-queue-display" class="hidden mb-2 space-y-1"></div>

        <!-- API Key Blocker Overlay -->
        <div id="pg-lock-overlay" class="absolute inset-0 bg-black/80 z-20 flex items-center justify-center hidden">
            <div class="text-rose-400 font-mono text-xs border border-rose-500/30 p-2 rounded bg-rose-900/20 animate-pulse">
                [SYSTEM_LOCK]: ADD_API_KEY_TO_ENABLE_INTERFACE
            </div>
        </div>

        <div class="flex gap-2 items-center">
            <span class="text-emerald-500 font-bold animate-pulse">></span>

            
            <!-- Attachment -->
            <button id="pg-attach" class="text-emerald-500/50 hover:text-emerald-400 transition-colors" title="Attach Image/Audio">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 6.375L8.562 17.311a1.5 1.5 0 01-2.121-2.121L12.75 8.75" />
                </svg>
            </button>
            <input type="file" id="pg-file" class="hidden" accept="image/*,audio/*">

            <textarea id="pg-prompt" class="flex-1 bg-transparent text-emerald-100 placeholder-emerald-500/30 resize-none focus:outline-none font-mono h-6" placeholder="Enter command..."></textarea>
            <button id="pg-exec-btn" class="text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/40 px-4 py-1 rounded transition-colors uppercase tracking-wider">Exec</button>
        </div>
        <div id="pg-attachment-preview" class="hidden mt-2 text-xs text-cyan-400 font-mono border border-cyan-500/30 bg-cyan-900/10 p-2 rounded flex justify-between items-center">
            <span id="pg-filename">filename.png</span>
            <button id="pg-clear-file" class="text-rose-400 hover:text-rose-300">[X]</button>
        </div>
    </div>

    <!-- Tools Modal -->
    <div id="pg-tools-modal" class="absolute inset-0 bg-black/95 z-50 flex flex-col p-6 hidden">
        <div class="flex justify-between items-center mb-4 border-b border-cyan-500/30 pb-2">
            <h3 class="text-cyan-400 font-bold tracking-widest text-sm uppercase">Function_Tools_Config</h3>
            <button id="pg-tools-close" class="text-rose-500 hover:text-rose-400 font-bold">[ CLOSE ]</button>
        </div>
        <p class="text-[10px] text-cyan-500/60 mb-4 font-mono">Define tools as a JSON array of OpenAI-compatible function definitions.</p>
        <textarea id="pg-tools-json" class="flex-1 bg-black/50 border border-cyan-500/20 rounded p-4 font-mono text-xs text-cyan-300 outline-none focus:border-cyan-500/50 resize-none" placeholder='[
  {
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather",
      "parameters": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        }
      }
    }
  }
]'></textarea>
        <div class="mt-4 flex justify-end gap-4">
            <button id="pg-tools-clear" class="text-[10px] text-rose-500/50 hover:text-rose-500 uppercase tracking-widest">Clear_All</button>
            <button id="pg-tools-save" class="px-6 py-2 bg-cyan-600/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-600/40 text-xs font-bold uppercase transition-all">Save_Configuration</button>
        </div>
    </div>

    <!-- Markdown & Styles -->
    <script src="/vendor/marked/marked.min.js"></script>
    <link rel="stylesheet" href="/vendor/marked/atom-one-dark.min.css">
    <script src="/vendor/marked/highlight.min.js"></script>
    
    <style>
        .markdown-content { font-size: 0.95rem; line-height: 1.7; color: #e2e8f0; }
        .markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6 {
            color: #10b981; font-weight: bold; margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.3;
        }
        .markdown-content h1 { font-size: 1.8em; border-bottom: 1px solid rgba(16,185,129,0.3); padding-bottom: 0.3em; }
        .markdown-content h2 { font-size: 1.5em; }
        .markdown-content h3 { font-size: 1.25em; }
        
        .markdown-content p { margin-bottom: 1em; }
        
        .markdown-content a { color: #34d399; text-decoration: none; border-bottom: 1px dashed #34d399; transition: all 0.2s; }
        .markdown-content a:hover { color: #6ee7b7; border-bottom-style: solid; }
        
        .markdown-content ul, .markdown-content ol { margin-bottom: 1em; padding-left: 1.5em; }
        .markdown-content ul { list-style-type: disc; }
        .markdown-content ol { list-style-type: decimal; }
        .markdown-content li { margin-bottom: 0.25em; }
        
        .markdown-content blockquote {
            border-left: 4px solid #10b981;
            background: rgba(16,185,129,0.05);
            padding: 0.5em 1em;
            margin-bottom: 1em;
            color: #94a3b8;
            font-style: italic;
        }
        
        .markdown-content code {
            font-family: 'JetBrains Mono', monospace;
            background: rgba(16, 185, 129, 0.1);
            color: #a7f3d0;
            padding: 0.2em 0.4em;
            border-radius: 0.25em;
            font-size: 0.85em;
        }
        
        .markdown-content pre {
            background: #1e1e1e; /* Atom One Dark bg match */
            padding: 1em;
            border-radius: 0.5em;
            overflow-x: auto;
            margin-bottom: 1em;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .markdown-content pre code {
            background: transparent;
            padding: 0;
            color: inherit;
            font-size: 0.85em;
        }
        
        .markdown-content table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1em;
            font-size: 0.9em;
        }
        .markdown-content th, .markdown-content td {
            border: 1px solid rgba(16, 185, 129, 0.2);
            padding: 0.75em;
            text-align: left;
        }
        .markdown-content th {
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
            font-weight: bold;
        }
        .markdown-content tr:nth-child(even) {
            background: rgba(255,255,255,0.02);
        }
        
        .markdown-content hr {
            border: 0;
            border-top: 1px solid rgba(16, 185, 129, 0.3);
            margin: 2em 0;
        }
        
        .markdown-content img {
            max-width: 100%;
            border-radius: 0.5em;
            border: 1px solid rgba(16, 185, 129, 0.2);
            margin: 1em 0;
        }

        details.thinking-wrap {
            border-left: 2px solid #fbbf24;
            background: rgba(251, 191, 36, 0.05);
            margin: 1rem 0;
            border-radius: 0 0.25rem 0.25rem 0;
        }
        details.thinking-wrap summary {
            padding: 0.5rem 1rem;
            cursor: pointer;
            color: #fbbf24;
            font-size: 0.85rem;
            font-weight: bold;
            user-select: none;
            outline: none;
            list-style: none; /* Hide default triangle in some browsers if unwanted, but we usually want it */
        }
        details.thinking-wrap summary::-webkit-details-marker {
            color: #fbbf24;
        }
        details.thinking-wrap[open] summary {
            border-bottom: 1px solid rgba(251, 191, 36, 0.1);
        }
        .thinking-content {
            padding: 0.5rem 1rem 1rem 1rem;
            font-style: italic;
            color: #d1d5db;
            font-size: 0.9em;
            white-space: pre-wrap;
        }
        .status-text {
            font-size: 0.7em;
            letter-spacing: 0.1em;
            font-weight: bold;
            color: #10b981;
            animation: pulse 1s infinite;
        }
    </style>

    <script nonce="<?php echo csp_nonce(); ?>">
    const reasoningSelect = document.getElementById('pg-reasoning');
    const attachBtn = document.getElementById('pg-attach');
    const fileInput = document.getElementById('pg-file');
    const previewDiv = document.getElementById('pg-attachment-preview');
    const filenameSpan = document.getElementById('pg-filename');
    const clearFileBtn = document.getElementById('pg-clear-file');
    
    // Missing DOM References
    const promptIn = document.getElementById('pg-prompt');
    const chatHistory = document.getElementById('chat-history');
    const providerDisplay = document.getElementById('pg-provider-display');
    const errorDisplay = document.getElementById('pg-error-display');
    const execBtn = document.getElementById('pg-exec-btn');
    
    let currentAttachment = null;

    // Typewriter Class for Streaming & Markdown
    class Typewriter {
        constructor(element) {
            this.element = element;
            this.queue = [];
            this.isTyping = false;
            this.rawText = '';
            
            // Cursor effect
            this.cursor = document.createElement('span');
            this.cursor.className = 'inline-block w-2 h-4 bg-emerald-500 ml-1 animate-pulse align-middle';
            this.element.appendChild(this.cursor);
            
            // Status Element
            this.statusSpan = document.createElement('span');
            this.statusSpan.className = 'status-text ml-2 hidden uppercase';
            this.element.appendChild(this.statusSpan);
        }
        
        setStatus(text) {
            if(text) {
                this.statusSpan.textContent = text;
                this.statusSpan.classList.remove('hidden');
                this.cursor.classList.add('hidden'); // Hide cursor when showing status
            } else {
                this.statusSpan.classList.add('hidden');
                this.cursor.classList.remove('hidden');
            }
        }

        add(text) {
            // Status remains visible as the "cursor" during typing
            this.queue.push(text);
            if (!this.isTyping) this.processQueue();
        }

        async processQueue() {
            if (this.queue.length === 0) {
                this.isTyping = false;
                return;
            }

            this.isTyping = true;
            const chunk = this.queue.shift();
            
            // Smooth Typing: split chunk into characters
            const chars = chunk.split('');
            for (const char of chars) {
                this.rawText += char;
                this.render();
                // Fast typing delay (e.g. 1-2ms)
                await new Promise(r => setTimeout(r, 2));
            }
            
            this.processQueue();
        }

        render() {
            // Convert markdown to HTML
            // Transform <thinking> and <think> tags to collapsible details BEFORE markdown parsing
            let processedText = this.rawText
                .replace(/<thinking>|<think>/g, '<details class="thinking-wrap" open><summary>Model Thoughts</summary><div class="thinking-content">')
                .replace(/<\/thinking>|<\/think>/g, '</div></details>');

            // Note: marked.parse might be synchronous. 
            // We use the 'marked' global from the included script.
            const html = marked.parse(processedText);
            
            // Update content (removing cursor/status first implicitly by overwrite, then re-adding)
            // We need to preserve status/cursor elements or re-append them
            // Simplest is to clear HTML and re-append. 
            // BUT careful not to lose current status state visibility?
            // Actually, render() is called often.
            
            this.element.innerHTML = html;
            this.element.appendChild(this.cursor);
            this.element.appendChild(this.statusSpan); // Re-append status span
            
            // Syntax Highlighting
            this.element.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });

            // Auto-scroll
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

        finish() {
            if(this.cursor && this.cursor.parentNode) {
                this.cursor.parentNode.removeChild(this.cursor);
            }
            if(this.statusSpan && this.statusSpan.parentNode) {
                this.statusSpan.parentNode.removeChild(this.statusSpan);
            }
            this.isTyping = false;
        }
    }

    // Helper: Add Message Entry to Chat
    function addEntry(role) {
        const div = document.createElement('div');
        div.className = role === 'user' 
            ? 'text-emerald-300 bg-emerald-900/10 p-2 rounded border border-emerald-500/20 whitespace-pre-wrap font-sans'
            : 'text-emerald-100 p-2 pl-4 border-l-2 border-emerald-500/50 markdown-content font-sans';
            
        const header = document.createElement('div');
        header.className = 'text-[10px] font-mono mb-1 ' + (role === 'user' ? 'text-emerald-500' : 'text-emerald-400');
        header.textContent = role === 'user' ? 'USER@COMMAND' : 'SMOLORCHESTRATOR_RESPONSE';
        div.appendChild(header);

        // Content container (for typewriter to target, or direct append)
        const content = document.createElement('div');
        div.appendChild(content);

        chatHistory.appendChild(div);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        
        return content; // Return the content container
    }

    // Queue System
    const messageQueue = [];
    let isProcessing = false;

    // Event Listeners
    execBtn.addEventListener('click', handleInput);
    promptIn.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleInput();
        }
    });

    // 1. Persist API Key & Check Lock
    const keyInput = document.getElementById('pg-key'); // Assuming keyInput is defined elsewhere or needs to be here
    const savedKey = localStorage.getItem('smolorchestrator_key');
    const lockOverlay = document.getElementById('pg-lock-overlay');
    
    function checkKey() {
        if (!keyInput.value.trim()) {
            lockOverlay.classList.remove('hidden');
        } else {
            lockOverlay.classList.add('hidden');
        }
    }

    if(savedKey) keyInput.value = savedKey;
    checkKey(); // Initial check

    keyInput.addEventListener('input', (e) => {
        const val = e.target.value;
        localStorage.setItem('smolorchestrator_key', val);
        checkKey();
    });

    // Attachment Logic
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;

        // Convert to Base64
        const reader = new FileReader();
        reader.onload = function(e) {
            currentAttachment = {
                data: e.target.result, // data:image/png;base64,...
                type: file.type.startsWith('image/') ? 'image_url' : 'input_audio',
                mime: file.type
            };
            filenameSpan.textContent = file.name;
            previewDiv.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });
    clearFileBtn.addEventListener('click', () => {
        fileInput.value = '';
        currentAttachment = null;
        previewDiv.classList.add('hidden');
    });

    // Tools Logic
    const toolsBtn = document.getElementById('pg-tools-btn');
    const toolsModal = document.getElementById('pg-tools-modal');
    const toolsClose = document.getElementById('pg-tools-close');
    const toolsSave = document.getElementById('pg-tools-save');
    const toolsClear = document.getElementById('pg-tools-clear');
    const toolsJson = document.getElementById('pg-tools-json');

    toolsBtn.addEventListener('click', () => toolsModal.classList.remove('hidden'));
    toolsClose.addEventListener('click', () => toolsModal.classList.add('hidden'));
    toolsClear.addEventListener('click', () => { toolsJson.value = ''; localStorage.removeItem('pg_tools'); });
    toolsSave.addEventListener('click', () => {
        localStorage.setItem('pg_tools', toolsJson.value);
        toolsModal.classList.add('hidden');
    });

    // Load saved tools
    const savedTools = localStorage.getItem('pg_tools');
    if (savedTools) toolsJson.value = savedTools;
    const queueContainer = document.getElementById('pg-queue-display');

    function renderQueue() {
        queueContainer.innerHTML = '';
        messageQueue.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'text-amber-500 bg-amber-900/10 p-2 rounded border border-amber-500/30 text-xs font-mono flex justify-between items-center';
            
            let prefix = '';
            if (item.attachment) {
                prefix = item.attachment.type === 'image_url' ? '[IMAGE] ' : '[AUDIO] ';
            }
            const snippet = (prefix + item.text).substring(0, 60) + ((prefix + item.text).length > 60 ? '...' : '');

            div.innerHTML = `
                <span class="truncate">QUEUED: ${snippet}</span>
                <button class="text-rose-500 hover:text-rose-400 font-bold px-2 ml-2" data-idx="${index}">[X]</button>
            `;
            
            const btn = div.querySelector('button');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFromQueue(index);
            });
            
            queueContainer.appendChild(div);
        });
        
        if(messageQueue.length > 0) queueContainer.classList.remove('hidden');
        else queueContainer.classList.add('hidden');
    }

    function removeFromQueue(index) {
        messageQueue.splice(index, 1);
        renderQueue();
    }

    function handleInput() {
        const text = promptIn.value.trim();
        if (!text && !currentAttachment) return;

        // Parse Tools
        let tools = null;
        try {
            if (toolsJson.value.trim()) {
                tools = JSON.parse(toolsJson.value.trim());
            }
        } catch(e) {
            console.error('Invalid Tools JSON', e);
        }

        // Capture State
        const payload = {
            text: text,
            attachment: currentAttachment, // Capture reference
            endpoint: document.getElementById('pg-endpoint').value,
            key: keyInput.value,
            reasoning: reasoningSelect.value,
            isStream: document.getElementById('pg-stream').checked,
            tools: tools
        };

        // Clear UI Immediately
        promptIn.value = '';
        fileInput.value = '';
        previewDiv.classList.add('hidden');
        currentAttachment = null;
        filenameSpan.textContent = 'filename.png'; 

        if (isProcessing) {
            messageQueue.push(payload);
            renderQueue();
        } else {
            processQueueItem(payload);
        }
    }
    
    // Trigger Next
    function triggerNext() {
        isProcessing = false;
        if (messageQueue.length > 0) {
            const next = messageQueue.shift();
            renderQueue();
            processQueueItem(next);
        }
    }

    async function processQueueItem(payload) {
        isProcessing = true;
        
        // Destructure payload
        const { text, attachment, endpoint, key, reasoning, isStream, tools } = payload;
        
        const userNode = addEntry('user');
        
        // Display Attachment in Chat
        if (attachment) {
            if (attachment.type === 'image_url') {
                userNode.innerHTML += `<br><img src="${attachment.data}" class="max-h-32 mt-2 rounded border border-emerald-500/30">`;
            } else {
                userNode.innerHTML += `<br>[AUDIO_ATTACHMENT]`; 
            }
        }
        
        userNode.innerHTML += (attachment ? '<br>' : '') + text;

        
        const botNode = addEntry('assistant');
        botNode.classList.remove('whitespace-pre-wrap');
        
        const typewriter = new Typewriter(botNode);
        typewriter.setStatus('ROUTING...');
        
        // Reset displays
        providerDisplay.classList.add('hidden');
        errorDisplay.classList.add('hidden');

        // Construct Messages
        let contentPayload = text;
        if (attachment) {
            contentPayload = [];
            if (text) contentPayload.push({type: 'text', text: text});
            
            if (attachment.type === 'image_url') {
                contentPayload.push({
                    type: 'image_url',
                    image_url: { url: attachment.data }
                });
            } else {
                // Audio
                const b64 = attachment.data.split(',')[1];
                contentPayload.push({
                    type: 'input_audio',
                    input_audio: { data: b64, format: 'wav' } // defaulting to wav for now, gateway should handle
                });
            }
        }

        // Construct Thinking Payload
        const apiPayload = {
            model: endpoint,
            messages: [{role: 'user', content: contentPayload}],
            stream: isStream
        };
        
        if (tools) {
            apiPayload.tools = tools;
            apiPayload.tool_choice = "auto";
        }
        
        if (reasoning !== 'disabled') {
            // Map to reasoning_effort for OpenAI compatibility / Gemini 2.5
            apiPayload.reasoning_effort = reasoning;
        }
        
        try {
            const res = await fetch('v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + key
                },
                body: JSON.stringify(apiPayload)
            });

            typewriter.setStatus('GENERATING...');

            // Update Provider Display
            const provider = res.headers.get('X-SmolOrchestrator-Provider');
            if(provider) {
                providerDisplay.textContent = 'VIA: ' + provider;
                providerDisplay.classList.remove('hidden');
            }

            if (!res.ok) {
                const data = await res.json();
                const errMsg = data.error || 'Unknown Error';
                errorDisplay.textContent = 'ERR: ' + errMsg;
                errorDisplay.classList.remove('hidden');
                
                typewriter.add('```json\n' + JSON.stringify(data, null, 2) + '\n```');
                typewriter.finish();
                botNode.classList.add('text-rose-400');
                triggerNext();
                return;
            }

            if (!isStream) {
                const data = await res.json();
                let content = data.choices?.[0]?.message?.content || '';
                
                // Handle Tool Calls in non-streaming
                const toolCalls = data.choices?.[0]?.message?.tool_calls;
                if (toolCalls && toolCalls.length > 0) {
                    content += '\n\n**[TOOL_CALLS]**\n```json\n' + JSON.stringify(toolCalls, null, 2) + '\n```';
                }
                
                if (!content) content = JSON.stringify(data, null, 2);
                
                typewriter.add(content);
                typewriter.finish();
                triggerNext();
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let finishReason = null; // Track finish state

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') break;
                        try {
                            const data = JSON.parse(dataStr);
                            const choice = data.choices?.[0];
                            if (choice) {
                                let content = choice.delta?.content || choice.delta?.reasoning_content || '';
                                
                                // Handle reasoning_content explicitly if provided by provider
                                if (choice.delta?.reasoning_content && !typewriter.rawText.includes('<thinking>') && !typewriter.rawText.includes('<think>')) {
                                    typewriter.add('<think>\n');
                                }

                                // Handle Tool Calls in streaming (Simplified: append as JSON block)
                                const toolCalls = choice.delta?.tool_calls;
                                if (toolCalls) {
                                     // We append tool calls as they come or wait for finish?
                                     // For simplicity in terminal, let's just mark it's happening
                                     if (!typewriter.rawText.includes('**[TOOL_CALLS_INITIATED]**')) {
                                         typewriter.add('\n\n**[TOOL_CALLS_INITIATED]**\n');
                                     }
                                     typewriter.add('`' + JSON.stringify(toolCalls) + '` ');
                                }

                                if (choice.finish_reason !== undefined) {
                                    finishReason = choice.finish_reason;
                                }
                                typewriter.add(content);
                            }
                        } catch(e){}
                    }
                }
            }
            
            // Wait for typing to finish before checking outcome
            const checkDone = setInterval(() => {
                if(!typewriter.isTyping && typewriter.queue.length === 0) {
                    clearInterval(checkDone);
                    typewriter.finish();
                    
                    // Check for incomplete stream (null finish_reason)
                    if (finishReason === null) {
                        botNode.classList.add('text-rose-400');
                        botNode.style.borderColor = '#fb7185'; // rose-400
                        errorDisplay.textContent = 'ERR: Stream Incomplete (finish_reason: null)';
                        errorDisplay.classList.remove('hidden');
                        
                        // Optional: Append error marker to text
                        const err = document.createElement('div');
                        err.className = 'text-rose-500 font-bold text-xs mt-2 border-t border-rose-500/30 pt-1';
                        err.innerHTML = '[CONNECTION_TERMINATED_UNEXPECTEDLY]';
                        botNode.appendChild(err);
                    }

                    triggerNext();
                }
            }, 100);

        } catch (e) {
            const msg = e.message;
            errorDisplay.textContent = 'ERR: ' + msg;
            errorDisplay.classList.remove('hidden');
            
            typewriter.add('\n[FATAL_ERROR: ' + msg + ']');
            typewriter.finish();
            botNode.classList.add('text-rose-400');
            triggerNext();
        }
    }
    </script>
</section>
