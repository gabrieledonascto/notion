// Widget de chat flutuante que conversa com o nó "Chat Trigger" do n8n
// (mesmo protocolo do @n8n/chat: POST { action: 'sendMessage', sessionId, chatInput }).
(function () {
  var cfg = window.CHAT_CONFIG
  if (!cfg) return

  var STORE = 'tiger-chat'
  var store = {
    get: function () { try { return JSON.parse(sessionStorage.getItem(STORE)) || {} } catch (e) { return {} } },
    set: function (v) { try { sessionStorage.setItem(STORE, JSON.stringify(v)) } catch (e) {} },
  }

  var state = store.get()
  state.sessionId = state.sessionId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))
  state.messages = state.messages || []
  var busy = false

  // ---------- ícones ----------
  var icons = {
    chat: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 3C6.48 3 2 6.92 2 11.75c0 2.47 1.18 4.7 3.08 6.28-.2 1.3-.83 2.53-1.83 3.47a.5.5 0 0 0 .36.86c1.98-.03 3.6-.7 4.8-1.56 1.12.33 2.33.5 3.59.5 5.52 0 10-3.92 10-8.75S17.52 3 12 3z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9z"/></svg>',
  }

  // ---------- markdown mínimo e seguro ----------
  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] })
  }
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
  }
  function markdown(src) {
    var out = []
    var parts = esc(src.trim()).split(/```[a-z]*\n?/)
    parts.forEach(function (part, i) {
      if (i % 2) { out.push('<pre><code>' + part.replace(/\n$/, '') + '</code></pre>'); return }
      var list = null
      part.split('\n').forEach(function (line) {
        var ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^#{1,6}\s+(.*)/)
        var type = ul ? 'ul' : ol ? 'ol' : null
        if (list && list !== type) { out.push('</' + list + '>'); list = null }
        if (type) {
          if (!list) { out.push('<' + type + '>'); list = type }
          out.push('<li>' + inline((ul || ol)[1]) + '</li>')
        } else if (h) out.push('<p><strong>' + inline(h[1]) + '</strong></p>')
        else if (line.trim()) out.push('<p>' + inline(line) + '</p>')
      })
      if (list) out.push('</' + list + '>')
    })
    return out.join('')
  }

  // ---------- DOM ----------
  function el(tag, cls, html) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (html != null) e.innerHTML = html
    return e
  }

  var isImg = /^(\.|\/|https?:)/.test(cfg.avatar || '')
  var avatarHtml = isImg ? '<img src="' + esc(cfg.avatar) + '" alt="" />' : esc(cfg.avatar || '🤖')

  var root = el('div', isImg ? 'tc tc-has-avatar' : 'tc')
  root.innerHTML =
    '<section class="tc-window" role="dialog" aria-label="' + esc(cfg.title) + '" hidden>' +
      '<header class="tc-header">' +
        '<div class="tc-avatar">' + avatarHtml + '</div>' +
        '<div class="tc-heading"><div class="tc-title">' + esc(cfg.title) + '</div>' +
        '<div class="tc-subtitle"><span class="tc-dot"></span>' + esc(cfg.subtitle) + '</div></div>' +
        '<button type="button" class="tc-icon-btn tc-close" aria-label="Fechar">' + icons.close + '</button>' +
      '</header>' +
      '<div class="tc-body">' +
        '<div class="tc-day">Hoje</div>' +
        '<div class="tc-messages" aria-live="polite"></div>' +
        '<div class="tc-suggestions"><div class="tc-suggestions-title">' + esc(cfg.suggestionsTitle) + '</div></div>' +
      '</div>' +
      '<footer class="tc-footer">' +
        '<form class="tc-form">' +
          '<textarea class="tc-input" rows="1" placeholder="' + esc(cfg.placeholder) + '" aria-label="' + esc(cfg.placeholder) + '"></textarea>' +
          '<button type="submit" class="tc-send" aria-label="Enviar" disabled>' + icons.send + '</button>' +
        '</form>' +
        '<div class="tc-disclaimer">' + icons.sparkle + '<span>' + esc(cfg.disclaimer) + '</span></div>' +
      '</footer>' +
    '</section>' +
    '<button type="button" class="tc-launcher" aria-label="Abrir ' + esc(cfg.title) + '" aria-expanded="false">' +
      '<span class="tc-launcher-open">' + (isImg ? '<img src="' + esc(cfg.avatar) + '" alt="" />' : icons.chat) + '</span><span class="tc-launcher-close">' + icons.down + '</span>' +
    '</button>'
  document.body.appendChild(root)

  var win = root.querySelector('.tc-window')
  var body = root.querySelector('.tc-body')
  var list = root.querySelector('.tc-messages')
  var sugg = root.querySelector('.tc-suggestions')
  var form = root.querySelector('.tc-form')
  var input = root.querySelector('.tc-input')
  var send = root.querySelector('.tc-send')
  var launcher = root.querySelector('.tc-launcher')

  ;(cfg.suggestions || []).forEach(function (q) {
    var b = el('button', 'tc-suggestion', '<span>' + esc(q) + '</span>' + icons.arrow)
    b.type = 'button'
    b.addEventListener('click', function () { ask(q) })
    sugg.appendChild(b)
  })

  function bubble(role, text) {
    var m = el('div', 'tc-msg tc-msg-' + role)
    m.innerHTML = role === 'bot' ? markdown(text) : '<p>' + esc(text) + '</p>'
    list.appendChild(m)
    return m
  }
  function scrollDown() { body.scrollTop = body.scrollHeight }
  function renderAll() {
    list.innerHTML = ''
    bubble('bot', cfg.welcome)
    state.messages.forEach(function (m) { bubble(m.role, m.text) })
    sugg.hidden = state.messages.length > 0
    scrollDown()
  }
  function save() {
    state.messages = state.messages.slice(-60)
    store.set(state)
  }

  // ---------- abrir/fechar ----------
  function setOpen(open) {
    win.hidden = !open
    root.classList.toggle('tc-open', open)
    launcher.setAttribute('aria-expanded', String(open))
    launcher.setAttribute('aria-label', (open ? 'Fechar ' : 'Abrir ') + cfg.title)
    state.open = open
    store.set(state)
    if (open) { scrollDown(); if (matchMedia('(pointer: fine)').matches) input.focus() }
  }
  launcher.addEventListener('click', function () { setOpen(win.hidden) })
  root.querySelector('.tc-close').addEventListener('click', function () { setOpen(false) })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !win.hidden) setOpen(false) })

  // ---------- input ----------
  function autosize() {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
    send.disabled = busy || !input.value.trim()
  }
  input.addEventListener('input', autosize)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit() }
  })
  form.addEventListener('submit', function (e) {
    e.preventDefault()
    ask(input.value)
  })

  // ---------- envio ----------
  // Aceita resposta comum ({ output }) e streaming do n8n (NDJSON com { type: 'item', content }).
  function extract(data) {
    if (data == null) return ''
    if (typeof data === 'string') return data
    if (Array.isArray(data)) return extract(data[0])
    return data.output || data.text || data.message || data.response || ''
  }

  async function ask(text) {
    text = (text || '').trim()
    if (!text || busy) return
    busy = true
    input.value = ''
    autosize()
    sugg.hidden = true
    state.messages.push({ role: 'user', text: text })
    save()
    bubble('user', text)

    var reply = bubble('bot', '')
    reply.classList.add('tc-typing')
    reply.innerHTML = '<span></span><span></span><span></span>'
    scrollDown()

    var answer = ''
    try {
      var res = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendMessage', sessionId: state.sessionId, chatInput: text }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)

      var raw = '', streamed = '', buf = ''
      var reader = res.body && res.body.getReader ? res.body.getReader() : null
      if (reader) {
        var dec = new TextDecoder()
        for (;;) {
          var chunk = await reader.read()
          if (chunk.done) break
          var piece = dec.decode(chunk.value, { stream: true })
          raw += piece
          buf += piece
          var lines = buf.split('\n')
          buf = lines.pop()
          lines.forEach(function (line) {
            try {
              var ev = JSON.parse(line)
              if (ev && ev.type === 'item' && typeof ev.content === 'string') streamed += ev.content
            } catch (err) {}
          })
          if (streamed) {
            reply.classList.remove('tc-typing')
            reply.innerHTML = markdown(streamed)
            scrollDown()
          }
        }
        try { var last = JSON.parse(buf); if (last && last.type === 'item') streamed += last.content || '' } catch (err) {}
      } else {
        raw = await res.text()
      }

      if (streamed) answer = streamed
      else {
        try { answer = extract(JSON.parse(raw)) } catch (err) { answer = raw }
      }
      if (!answer.trim()) throw new Error('resposta vazia')
    } catch (err) {
      console.warn('[chat]', err)
      answer = cfg.errorMessage
    }

    reply.classList.remove('tc-typing')
    reply.innerHTML = markdown(answer)
    state.messages.push({ role: 'bot', text: answer })
    save()
    busy = false
    autosize()
    scrollDown()
  }

  renderAll()
  if (state.open) setOpen(true)
})()
