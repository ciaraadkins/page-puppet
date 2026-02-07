class DOMManipulator {
  constructor() {
    this.actionMap = {
      'changeColor': this.changeColor.bind(this),
      'changeBackgroundColor': this.changeBackgroundColor.bind(this),
      'changeSize': this.changeSize.bind(this),
      'changeWidth': this.changeWidth.bind(this),
      'changeHeight': this.changeHeight.bind(this),
      'changeOpacity': this.changeOpacity.bind(this),
      'hide': this.hide.bind(this),
      'show': this.show.bind(this),
      'changeBorder': this.changeBorder.bind(this),
      'addShadow': this.addShadow.bind(this),
      'rotate': this.rotate.bind(this),
      'changeText': this.changeText.bind(this),
      'addText': this.addText.bind(this)
    };
  }

  executeCommand(command, element) {
    log('INFO', 'executeCommand called', {
      hasElement: !!element,
      elementTag: element?.tagName,
      elementId: element?.id,
      action: command?.action,
      value: command?.value,
      confidence: command?.confidence
    });

    if (!element || !command.action || command.confidence < 0.5) {
      log('WARN', 'executeCommand rejected', {
        hasElement: !!element,
        hasAction: !!command?.action,
        confidence: command?.confidence
      });
      return false;
    }

    const action = this.actionMap[command.action];
    if (action) {
      try {
        log('INFO', 'Calling action method', { action: command.action, value: command.value });
        this.addUndoCapability(element, command);
        action(element, command.value);
        log('INFO', 'Action method completed successfully');
        return true;
      } catch (error) {
        log('ERROR', 'DOM manipulation failed', {
          action: command.action,
          value: command.value,
          error: error.message
        });
        return false;
      }
    } else {
      log('WARN', 'Action not found in actionMap', { action: command.action });
    }
    return false;
  }

  changeColor(element, color) {
    element.style.color = this.parseColor(color);
  }

  changeBackgroundColor(element, color) {
    element.style.backgroundColor = this.parseColor(color);
  }

  changeSize(element, size) {
    const multiplier = this.parseSize(size);
    const currentFontSize = parseFloat(window.getComputedStyle(element).fontSize);
    element.style.fontSize = `${currentFontSize * multiplier}px`;
  }

  changeWidth(element, width) {
    if (width.includes('px') || width.includes('%')) {
      element.style.width = width;
    } else {
      const multiplier = this.parseSize(width);
      const currentWidth = parseFloat(window.getComputedStyle(element).width);
      element.style.width = `${currentWidth * multiplier}px`;
    }
  }

  changeHeight(element, height) {
    if (height.includes('px') || height.includes('%')) {
      element.style.height = height;
    } else {
      const multiplier = this.parseSize(height);
      const currentHeight = parseFloat(window.getComputedStyle(element).height);
      element.style.height = `${currentHeight * multiplier}px`;
    }
  }

  changeOpacity(element, opacity) {
    const value = this.parseOpacity(opacity);
    element.style.opacity = value;
  }

  hide(element) {
    element.dataset.originalDisplay = element.style.display || window.getComputedStyle(element).display;
    element.style.display = 'none';
  }

  show(element) {
    element.style.display = element.dataset.originalDisplay || 'block';
  }

  changeBorder(element, borderStyle) {
    if (borderStyle.toLowerCase().includes('remove') || borderStyle.toLowerCase().includes('none')) {
      element.style.border = 'none';
    } else {
      element.style.border = `2px solid ${this.parseColor(borderStyle)}`;
    }
  }

  addShadow(element, shadowType) {
    element.style.boxShadow = this.generateShadow(shadowType);
  }

  rotate(element, degrees) {
    const rotation = degrees.includes('deg') ? degrees : (degrees.match(/\d+/) ? `${degrees}deg` : degrees);
    element.style.transform = `rotate(${rotation})`;
  }

  changeText(element, text) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = text;
    } else {
      element.textContent = text;
    }
  }

  addText(element, text) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value += text;
    } else {
      element.textContent += text;
    }
  }

  parseColor(colorInput) {
    const colorMap = {
      'blue': '#0000ff', 'green': '#00ff00', 'purple': '#800080',
      'orange': '#ffa500', 'yellow': '#ffff00', 'pink': '#ffc0cb',
      'cyan': '#00ffff', 'magenta': '#ff00ff', 'lime': '#00ff00',
      'black': '#000000', 'white': '#ffffff', 'gray': '#808080',
      'grey': '#808080', 'brown': '#a52a2a', 'red': '#ff0000',
      'forest green': '#228b22', 'dark green': '#006400', 'light blue': '#add8e6',
      'dark blue': '#00008b', 'light green': '#90ee90', 'navy': '#000080'
    };

    const result = colorMap[colorInput.toLowerCase()] || colorInput;
    log('DEBUG', 'parseColor result', { input: colorInput, output: result, mapped: !!colorMap[colorInput.toLowerCase()] });
    return result;
  }

  parseSize(sizeInput) {
    const sizeMap = {
      'bigger': 1.2, 'smaller': 0.8, 'huge': 2.0, 'tiny': 0.5,
      'large': 1.5, 'small': 0.7, 'double': 2.0, 'half': 0.5,
      'larger': 1.3, 'much bigger': 1.5, 'much smaller': 0.6
    };

    return sizeMap[sizeInput.toLowerCase()] || 1.0;
  }

  parseOpacity(opacityInput) {
    const opacityMap = {
      'transparent': '0', 'invisible': '0', 'semi-transparent': '0.5',
      'translucent': '0.5', 'opaque': '1', 'solid': '1',
      'faded': '0.3', 'very faded': '0.1', 'slightly faded': '0.7'
    };

    if (opacityMap[opacityInput.toLowerCase()]) {
      return opacityMap[opacityInput.toLowerCase()];
    }

    const numValue = parseFloat(opacityInput);
    if (!isNaN(numValue)) {
      return Math.max(0, Math.min(1, numValue)).toString();
    }

    return '1';
  }

  generateShadow(shadowType) {
    const shadowMap = {
      'small': '0 2px 4px rgba(0,0,0,0.2)',
      'medium': '0 4px 8px rgba(0,0,0,0.3)',
      'large': '0 8px 16px rgba(0,0,0,0.4)',
      'subtle': '0 1px 3px rgba(0,0,0,0.1)',
      'strong': '0 10px 20px rgba(0,0,0,0.5)',
      'glow': '0 0 20px rgba(255,255,255,0.8)',
      'none': 'none'
    };

    return shadowMap[shadowType.toLowerCase()] || '0 4px 8px rgba(0,0,0,0.3)';
  }

  addUndoCapability(element, command) {
    if (!element.dataset.voiceControlHistory) {
      element.dataset.voiceControlHistory = JSON.stringify([]);
    }

    const history = JSON.parse(element.dataset.voiceControlHistory);
    history.push({
      command,
      timestamp: Date.now(),
      previousStyles: element.style.cssText
    });

    element.dataset.voiceControlHistory = JSON.stringify(history.slice(-10));
  }
}
