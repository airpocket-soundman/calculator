(function () {
  "use strict";

  const state = {
    angleMode: "DEG",
    memory: 0,
    ans: 0,
    deferredPrompt: null,
    touchLikeDevice: false,
  };

  const operatorConfig = {
    "+": { precedence: 2, associativity: "left", argCount: 2, fn: (a, b) => a + b },
    "-": { precedence: 2, associativity: "left", argCount: 2, fn: (a, b) => a - b },
    "*": { precedence: 3, associativity: "left", argCount: 2, fn: (a, b) => a * b },
    "/": {
      precedence: 3,
      associativity: "left",
      argCount: 2,
      fn: (a, b) => {
        if (b === 0) {
          throw new Error("0で割ることはできません");
        }
        return a / b;
      },
    },
    "^": { precedence: 4, associativity: "right", argCount: 2, fn: (a, b) => Math.pow(a, b) },
    "u-": { precedence: 5, associativity: "right", argCount: 1, fn: (a) => -a },
    "!": { precedence: 6, associativity: "left", argCount: 1, fn: factorial },
    "%": { precedence: 6, associativity: "left", argCount: 1, fn: (a) => a / 100 },
  };

  const functionConfig = {
    sin: { argCount: 1, fn: (a, mode) => Math.sin(toRadians(a, mode)) },
    cos: { argCount: 1, fn: (a, mode) => Math.cos(toRadians(a, mode)) },
    tan: { argCount: 1, fn: (a, mode) => Math.tan(toRadians(a, mode)) },
    asin: { argCount: 1, fn: (a, mode) => fromRadians(Math.asin(a), mode) },
    acos: { argCount: 1, fn: (a, mode) => fromRadians(Math.acos(a), mode) },
    atan: { argCount: 1, fn: (a, mode) => fromRadians(Math.atan(a), mode) },
    sqrt: {
      argCount: 1,
      fn: (a) => {
        if (a < 0) {
          throw new Error("負数の平方根は計算できません");
        }
        return Math.sqrt(a);
      },
    },
    log: {
      argCount: 1,
      fn: (a) => {
        if (a <= 0) {
          throw new Error("logの引数は正数である必要があります");
        }
        return Math.log10(a);
      },
    },
    ln: {
      argCount: 1,
      fn: (a) => {
        if (a <= 0) {
          throw new Error("lnの引数は正数である必要があります");
        }
        return Math.log(a);
      },
    },
    root: {
      argCount: 2,
      fn: (a, b) => {
        if (b === 0) {
          throw new Error("0乗根は定義されません");
        }
        return a < 0 && Math.abs(b % 2) !== 1 ? -Math.pow(-a, 1 / b) : Math.pow(a, 1 / b);
      },
    },
  };

  function toRadians(value, mode) {
    return mode === "DEG" ? value * (Math.PI / 180) : value;
  }

  function fromRadians(value, mode) {
    return mode === "DEG" ? value * (180 / Math.PI) : value;
  }

  function factorial(value) {
    if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
      throw new Error("階乗は0以上の整数にのみ対応します");
    }
    let result = 1;
    for (let i = 2; i <= value; i += 1) {
      result *= i;
    }
    return result;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      throw new Error("計算結果が不正です");
    }
    if (Object.is(value, -0)) {
      return "0";
    }
    const absValue = Math.abs(value);
    if ((absValue !== 0 && absValue >= 1e12) || (absValue !== 0 && absValue < 1e-8)) {
      return value.toExponential(10).replace(/\.?0+e/, "e");
    }
    return Number.parseFloat(value.toPrecision(12)).toString();
  }

  function shouldInsertMultiply(previous, current) {
    const previousCanClose =
      previous.type === "number" ||
      previous.type === "constant" ||
      previous.type === "identifier" ||
      previous.type === "rparen" ||
      (previous.type === "operator" && (previous.value === "!" || previous.value === "%"));
    const currentCanOpen =
      current.type === "number" ||
      current.type === "constant" ||
      current.type === "identifier" ||
      current.type === "function" ||
      current.type === "lparen";
    return previousCanClose && currentCanOpen;
  }

  function maybeInsertImplicitMultiply(tokens) {
    const result = [];
    for (const token of tokens) {
      const previous = result[result.length - 1];
      if (previous && shouldInsertMultiply(previous, token)) {
        result.push({ type: "operator", value: "*" });
      }
      result.push(token);
    }
    return result;
  }

  function tokenize(expression) {
    const rawTokens = [];
    let index = 0;

    while (index < expression.length) {
      const char = expression[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        let number = char;
        index += 1;
        while (index < expression.length && /[0-9.]/.test(expression[index])) {
          number += expression[index];
          index += 1;
        }
        if ((number.match(/\./g) || []).length > 1) {
          throw new Error("数値の形式が正しくありません");
        }
        rawTokens.push({ type: "number", value: Number(number) });
        continue;
      }

      if (/[A-Za-z]/.test(char)) {
        let identifier = char;
        index += 1;
        while (index < expression.length && /[A-Za-z]/.test(expression[index])) {
          identifier += expression[index];
          index += 1;
        }
        const normalized = identifier.toLowerCase();
        if (normalized === "pi" || normalized === "e") {
          rawTokens.push({ type: "constant", value: normalized });
        } else if (normalized === "ans") {
          rawTokens.push({ type: "identifier", value: "Ans" });
        } else if (functionConfig[normalized]) {
          rawTokens.push({ type: "function", value: normalized });
        } else {
          throw new Error(`未対応の識別子です: ${identifier}`);
        }
        continue;
      }

      if ("+-*/^!%(),".includes(char)) {
        if (char === "(") {
          rawTokens.push({ type: "lparen", value: char });
        } else if (char === ")") {
          rawTokens.push({ type: "rparen", value: char });
        } else if (char === ",") {
          rawTokens.push({ type: "comma", value: char });
        } else {
          rawTokens.push({ type: "operator", value: char });
        }
        index += 1;
        continue;
      }

      throw new Error(`未対応の文字です: ${char}`);
    }

    return maybeInsertImplicitMultiply(rawTokens);
  }

  function convertUnaryOperators(tokens) {
    return tokens.map((token, index) => {
      if (token.type !== "operator" || token.value !== "-") {
        return token;
      }
      const previous = tokens[index - 1];
      const unary =
        !previous ||
        previous.type === "operator" ||
        previous.type === "lparen" ||
        previous.type === "comma";
      return unary ? { type: "operator", value: "u-" } : token;
    });
  }

  function toRpn(tokens) {
    const output = [];
    const operators = [];

    for (const token of convertUnaryOperators(tokens)) {
      if (token.type === "number" || token.type === "constant" || token.type === "identifier") {
        output.push(token);
        continue;
      }

      if (token.type === "function") {
        operators.push(token);
        continue;
      }

      if (token.type === "comma") {
        while (operators.length && operators[operators.length - 1].type !== "lparen") {
          output.push(operators.pop());
        }
        if (!operators.length) {
          throw new Error("カンマの位置が正しくありません");
        }
        continue;
      }

      if (token.type === "operator") {
        const current = operatorConfig[token.value];
        while (operators.length) {
          const top = operators[operators.length - 1];
          if (top.type !== "operator") {
            break;
          }
          const previous = operatorConfig[top.value];
          const shouldPop =
            (current.associativity === "left" && current.precedence <= previous.precedence) ||
            (current.associativity === "right" && current.precedence < previous.precedence);
          if (!shouldPop) {
            break;
          }
          output.push(operators.pop());
        }
        operators.push(token);
        continue;
      }

      if (token.type === "lparen") {
        operators.push(token);
        continue;
      }

      if (token.type === "rparen") {
        while (operators.length && operators[operators.length - 1].type !== "lparen") {
          output.push(operators.pop());
        }
        if (!operators.length) {
          throw new Error("括弧が閉じていません");
        }
        operators.pop();
        if (operators.length && operators[operators.length - 1].type === "function") {
          output.push(operators.pop());
        }
      }
    }

    while (operators.length) {
      const operator = operators.pop();
      if (operator.type === "lparen" || operator.type === "rparen") {
        throw new Error("括弧の対応が正しくありません");
      }
      output.push(operator);
    }

    return output;
  }

  function evaluateRpn(rpn, options) {
    const stack = [];

    for (const token of rpn) {
      if (token.type === "number") {
        stack.push(token.value);
        continue;
      }
      if (token.type === "constant") {
        stack.push(token.value === "pi" ? Math.PI : Math.E);
        continue;
      }
      if (token.type === "identifier") {
        stack.push(options.ans);
        continue;
      }
      if (token.type === "operator") {
        const config = operatorConfig[token.value];
        if (stack.length < config.argCount) {
          throw new Error("式が不完全です");
        }
        const args = stack.splice(stack.length - config.argCount, config.argCount);
        stack.push(config.fn(...args));
        continue;
      }
      if (token.type === "function") {
        const config = functionConfig[token.value];
        if (stack.length < config.argCount) {
          throw new Error("関数の引数が不足しています");
        }
        const args = stack.splice(stack.length - config.argCount, config.argCount);
        stack.push(config.fn(...args, options.angleMode));
      }
    }

    if (stack.length !== 1) {
      throw new Error("式を評価できません");
    }
    return stack[0];
  }

  function evaluateExpression(expression, options) {
    const trimmed = expression.trim();
    if (!trimmed) {
      throw new Error("式を入力してください");
    }
    return evaluateRpn(toRpn(tokenize(trimmed)), options);
  }

  function findNumberBounds(value, caretStart, caretEnd) {
    if (caretStart !== caretEnd) {
      return { start: caretStart, end: caretEnd };
    }
    let start = caretStart;
    let end = caretEnd;
    while (start > 0 && /[0-9.]/.test(value[start - 1])) {
      start -= 1;
    }
    while (end < value.length && /[0-9.]/.test(value[end])) {
      end += 1;
    }
    return { start, end };
  }

  function insertText(input, text) {
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    input.setRangeText(text, start, end, "end");
    const caret = start + text.length;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function toggleSignInInput(input) {
    const value = input.value;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const bounds = findNumberBounds(value, start, end);
    if (bounds.start === bounds.end) {
      insertText(input, "-");
      return;
    }
    const segment = value.slice(bounds.start, bounds.end);
    const wrapperStart = Math.max(0, bounds.start - 2);
    const wrapped = value.slice(wrapperStart, bounds.end + 1);
    if (wrapped === `(-${segment})`) {
      input.setRangeText(segment, wrapperStart, bounds.end + 1, "end");
      input.setSelectionRange(wrapperStart, wrapperStart + segment.length);
    } else {
      input.setRangeText(`(-${segment})`, bounds.start, bounds.end, "end");
      input.setSelectionRange(bounds.start + 2, bounds.start + 2 + segment.length);
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function updateAngleButton(button, indicator) {
    button.textContent = state.angleMode;
    indicator.textContent = state.angleMode;
  }

  function updateMemoryIndicator(element) {
    element.textContent = `MEM ${formatNumber(state.memory)}`;
  }

  function updatePreview(input, preview) {
    const expression = input.value.trim();
    if (!expression) {
      preview.textContent = "Ready";
      preview.dataset.state = "idle";
      return;
    }

    try {
      const result = evaluateExpression(expression, state);
      preview.textContent = `= ${formatNumber(result)}`;
      preview.dataset.state = "ok";
    } catch (error) {
      preview.textContent = error.message;
      preview.dataset.state = "error";
    }
  }

  function performEvaluation(input, preview) {
    const result = evaluateExpression(input.value, state);
    state.ans = result;
    input.value = formatNumber(result);
    input.setSelectionRange(input.value.length, input.value.length);
    preview.textContent = `= ${input.value}`;
    preview.dataset.state = "ok";
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  function initInstallPrompt(button) {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredPrompt = event;
      button.hidden = false;
    });

    button.addEventListener("click", async () => {
      if (!state.deferredPrompt) {
        return;
      }
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
      button.hidden = true;
    });
  }

  function initApp() {
    const input = document.getElementById("expression");
    const preview = document.getElementById("preview-message");
    const angleIndicator = document.getElementById("angle-mode");
    const memoryIndicator = document.getElementById("memory-indicator");
    const installButton = document.getElementById("install-button");
    const angleButton = document.querySelector('[data-action="toggle-angle"]');
    const keypad = document.querySelector(".keypad");
    state.touchLikeDevice =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (state.touchLikeDevice) {
      input.readOnly = true;
      input.setAttribute("inputmode", "none");
    }

    updateAngleButton(angleButton, angleIndicator);
    updateMemoryIndicator(memoryIndicator);
    updatePreview(input, preview);
    initInstallPrompt(installButton);

    input.addEventListener("input", () => updatePreview(input, preview));

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        try {
          performEvaluation(input, preview);
        } catch (error) {
          preview.textContent = error.message;
          preview.dataset.state = "error";
        }
      } else if (event.key === "Escape") {
        input.value = "";
        updatePreview(input, preview);
      }
    });

    keypad.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const insert = button.dataset.insert;

      try {
        if (insert) {
          insertText(input, insert);
          return;
        }

        switch (action) {
          case "clear-all":
            input.value = "";
            updatePreview(input, preview);
            input.focus();
            break;
          case "backspace": {
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            if (start !== end) {
              input.setRangeText("", start, end, "start");
            } else if (start > 0) {
              input.setRangeText("", start - 1, start, "start");
            }
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.focus();
            break;
          }
          case "delete": {
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            if (start !== end) {
              input.setRangeText("", start, end, "start");
            } else if (start < input.value.length) {
              input.setRangeText("", start, start + 1, "start");
            }
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.focus();
            break;
          }
          case "move-left": {
            const next = Math.max((input.selectionStart || 0) - 1, 0);
            input.setSelectionRange(next, next);
            input.focus();
            break;
          }
          case "move-right": {
            const next = Math.min((input.selectionEnd || 0) + 1, input.value.length);
            input.setSelectionRange(next, next);
            input.focus();
            break;
          }
          case "toggle-angle":
            state.angleMode = state.angleMode === "DEG" ? "RAD" : "DEG";
            updateAngleButton(angleButton, angleIndicator);
            updatePreview(input, preview);
            break;
          case "evaluate":
            performEvaluation(input, preview);
            break;
          case "toggle-sign":
            toggleSignInInput(input);
            break;
          case "insert-square":
            insertText(input, "^2");
            break;
          case "insert-cube":
            insertText(input, "^3");
            break;
          case "insert-percent":
            insertText(input, "%");
            break;
          case "memory-clear":
            state.memory = 0;
            updateMemoryIndicator(memoryIndicator);
            break;
          case "memory-recall":
            insertText(input, formatNumber(state.memory));
            break;
          case "memory-add": {
            const value = evaluateExpression(input.value || "0", state);
            state.memory += value;
            state.ans = value;
            updateMemoryIndicator(memoryIndicator);
            updatePreview(input, preview);
            break;
          }
          case "memory-subtract": {
            const value = evaluateExpression(input.value || "0", state);
            state.memory -= value;
            state.ans = value;
            updateMemoryIndicator(memoryIndicator);
            updatePreview(input, preview);
            break;
          }
          default:
            break;
        }
      } catch (error) {
        preview.textContent = error.message;
        preview.dataset.state = "error";
      }
    });

    registerServiceWorker();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initApp);
    } else {
      initApp();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { evaluateExpression, formatNumber };
  } else if (typeof window !== "undefined") {
    window.CalculatorEvaluator = { evaluateExpression, formatNumber };
  }
})();
