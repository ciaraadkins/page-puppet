class ElementDetector {
  constructor() {
    this.currentElement = null;
    this.highlightOverlay = null;
    this.isActive = false;
    this.onHoverCallback = null;
    this._lastHoverEmit = 0;
    this.setupEventListeners();
    log('INFO', 'ElementDetector initialized');
  }

  setupEventListeners() {
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    log('INFO', 'ElementDetector event listeners setup');
  }

  handleMouseMove(event) {
    if (!this.isActive) return;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (element && element !== this.currentElement && element !== this.highlightOverlay) {
      log('DEBUG', 'Element hover detected', {
        tagName: element.tagName,
        id: element.id,
        className: element.className
      });
      this.updateHighlight(element);
      this.currentElement = element;

      // Throttled hover callback (500ms)
      const now = Date.now();
      if (this.onHoverCallback && now - this._lastHoverEmit > 500) {
        this._lastHoverEmit = now;
        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const cls = element.className && typeof element.className === 'string'
          ? '.' + element.className.trim().split(/\s+/).join('.') : '';
        this.onHoverCallback(`<${tag}${id}${cls}>`);
      }
    }
  }

  handleMouseOut(event) {
    if (!event.relatedTarget && this.isActive) {
      this.removeHighlight();
      this.currentElement = null;
    }
  }

  updateHighlight(element) {
    this.removeHighlight();

    const rect = element.getBoundingClientRect();
    this.highlightOverlay = document.createElement('div');
    this.highlightOverlay.className = 'voice-control-highlight';
    this.highlightOverlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 3px solid #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
      pointer-events: none;
      z-index: 999999;
      border-radius: 4px;
      box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
    `;

    document.body.appendChild(this.highlightOverlay);
    log('DEBUG', 'Element highlighted', {
      rect: { width: rect.width, height: rect.height }
    });
  }

  removeHighlight() {
    if (this.highlightOverlay) {
      this.highlightOverlay.remove();
      this.highlightOverlay = null;
    }
  }

  getElementContext(element) {
    if (!element) return null;

    const computedStyle = window.getComputedStyle(element);

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: element.className || null,
      textContent: element.textContent?.substring(0, 100) || null,
      styles: {
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        fontSize: computedStyle.fontSize,
        width: computedStyle.width,
        height: computedStyle.height,
        position: computedStyle.position,
        display: computedStyle.display,
        opacity: computedStyle.opacity
      },
      rect: element.getBoundingClientRect()
    };
  }

  activate() {
    this.isActive = true;
    log('INFO', 'ElementDetector activated');
  }

  deactivate() {
    this.isActive = false;
    this.removeHighlight();
    this.currentElement = null;
    log('INFO', 'ElementDetector deactivated');
  }
}
