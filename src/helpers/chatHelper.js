const { createRoomPathHelperScript } = require('./cocosHelper');

function getChatHelperScript() {
  return `
    ${createRoomPathHelperScript()}
    function findNodeRecursive(node, targetName) {
      if (!node) return null;
      if (node.name === targetName) return node;
      if (!node.children) return null;
      for (const child of node.children) {
        const found = findNodeRecursive(child, targetName);
        if (found) return found;
      }
      return null;
    }

    function findNodeByPath(path) {
      const scene = cc.director.getScene();
      if (!scene) return null;
      const parts = path.split('/').filter(Boolean);
      let node = scene;
      for (const part of parts) {
        if (!node) break;
        if (node.name === part) {
          continue;
        }
        if (!node.getChildByName) {
          node = null;
          break;
        }
        node = node.getChildByName(part);
      }
      if (node) return node;
      const fallbackName = parts.length ? parts[parts.length - 1] : null;
      if (!fallbackName) return null;
      return findNodeRecursive(scene, fallbackName);
    }

    function createTouchEvent(targetNode) {
      return {
        touch: { getLocation: () => ({ x: 0, y: 0 }) },
        getLocation: () => ({ x: 0, y: 0 }),
        target: targetNode,
        currentTarget: targetNode
      };
    }
  `;
}

const CHAT_PATHS = {
  chatRoot: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp',
  chatWindow: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ChatMessageContainer',
  messageContainer: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ChatMessageContainer/NormalMessageComp/view/ContainerMessageItems',
  emojiButton: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ButtonEmoji',
  emojiList: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/EmojiList',
  emojiContainer: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/EmojiList/ScrollerEmojiItem/view/ContainerEmojiItem',
  inputBox: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/InputBox',
  sendButton: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/ButtonSend',
  channelButton: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/ChannelButton',
  channelPanel: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/ChannelButton/ChannelPanel',
  channelLock: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/ChannelButton/ChannelPanel/BgLock',
  channelUnlock: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/ChannelButton/ChannelPanel/BgUnlock',
  channelAllToggle: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/ChannelButton/ChannelPanel/BgUnlock/ToggleGroup/ChannelAll',
  channelVIPToggle: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameChatComp/ContainerSending/ContainerInput/ChannelButton/ChannelPanel/BgUnlock/ToggleGroup/ChannelL4L5',
  chatSwitchButton: 'Main/Canvas/viewRoot/Layer_Default/ColorGameBonusRoomView/ColorGameButtonSet/ChatSwitchButton'
};

async function ensureChannelPanel(page) {
  const helpers = getChatHelperScript();
  const result = await page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const button = findNodeByPath(paths.channelButton);
    if (!button) {
      return { success: false, error: 'ChannelButton not found' };
    }
    const panel = findNodeByPath(paths.channelPanel);
    if (panel?.active) {
      return { success: true, alreadyOpen: true };
    }
    const touch = createTouchEvent(button);
    button.emit(cc.Node.EventType.TOUCH_START, touch);
    button.emit(cc.Node.EventType.TOUCH_END, touch);
    return { success: true, alreadyOpen: false };
  }, { paths: CHAT_PATHS, helperScript: helpers });

  if (!result?.success) {
    throw new Error(result?.error || '無法開啟 Channel 面板');
  }

  if (!result.alreadyOpen) {
    await page.waitForTimeout(120);
  }
  return result;
}

async function closeChannelPanel(page) {
  const helpers = getChatHelperScript();
  await page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const panel = findNodeByPath(paths.channelPanel);
    if (!panel || !panel.active) return;
    const button = findNodeByPath(paths.channelButton);
    if (!button) return;
    const touch = createTouchEvent(button);
    button.emit(cc.Node.EventType.TOUCH_START, touch);
    button.emit(cc.Node.EventType.TOUCH_END, touch);
  }, { paths: CHAT_PATHS, helperScript: helpers });
  await page.waitForTimeout(150);
}

async function readMessageCoolDown(page, roomId) {
  const cooldown = await page.evaluate((room) => {
    try {
      const table = App?.model?.tableCollection?.getTable(room);
      const value = table?._chat?._messageCoolDownTime;
      return typeof value === 'number' ? value : null;
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  }, roomId);

  if (cooldown && typeof cooldown === 'object' && cooldown.error) {
    throw new Error(`取得冷卻時間失敗: ${cooldown.error}`);
  }

  return typeof cooldown === 'number' ? cooldown : 0;
}

async function getChatWindowState(page) {
  const helpers = getChatHelperScript();
  return page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const chatWindow = findNodeByPath(paths.chatWindow);
    if (!chatWindow) {
      return { isOpen: false, opacity: 0, error: 'chatWindow not found' };
    }
    const openIcon = findNodeByPath(paths.chatSwitchButton + '/OpenIcon');
    const closeIcon = findNodeByPath(paths.chatSwitchButton + '/CloseIcon');
    return {
      isOpen: chatWindow.opacity >= 250,
      opacity: chatWindow.opacity,
      openIcon: !!openIcon?.active,
      closeIcon: !!closeIcon?.active
    };
  }, { paths: CHAT_PATHS, helperScript: helpers });
}

async function ensureChatWindow(page, desiredState = 'on') {
  const state = await getChatWindowState(page);
  const shouldOpen = desiredState === 'on';
  const alreadyCorrect = shouldOpen ? state.isOpen : !state.isOpen;
  if (alreadyCorrect) {
    await page.waitForTimeout(500);
    return state;
  }

  const helpers = getChatHelperScript();
  await page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const button = findNodeByPath(paths.chatSwitchButton);
    if (!button) throw new Error('ChatSwitchButton not found');
    const touch = createTouchEvent(button);
    button.emit(cc.Node.EventType.TOUCH_START, touch);
    button.emit(cc.Node.EventType.TOUCH_END, touch);
  }, { paths: CHAT_PATHS, helperScript: helpers });

  await page.waitForTimeout(200);
  let finalState = await getChatWindowState(page);

  const finalCorrect = shouldOpen ? finalState.isOpen : !finalState.isOpen;
  if (finalCorrect) {
    await page.waitForTimeout(500);
    return finalState;
  }

  // Fallback：直接設定節點狀態
  await page.evaluate(({ paths, helperScript, targetState }) => {
    eval(helperScript);
    const chatWindow = findNodeByPath(paths.chatWindow);
    const openIcon = findNodeByPath(paths.chatSwitchButton + '/OpenIcon');
    const closeIcon = findNodeByPath(paths.chatSwitchButton + '/CloseIcon');
    if (!chatWindow) return;
    if (targetState === 'on') {
      chatWindow.opacity = 255;
      chatWindow.active = true;
      if (openIcon) openIcon.active = true;
      if (closeIcon) closeIcon.active = false;
    } else {
      chatWindow.opacity = 0;
      chatWindow.active = false;
      if (openIcon) openIcon.active = false;
      if (closeIcon) closeIcon.active = true;
    }
  }, { paths: CHAT_PATHS, helperScript: helpers, targetState: desiredState });

  await page.waitForTimeout(150);
  finalState = await getChatWindowState(page);
  await page.waitForTimeout(500);
  return finalState;
}

async function readChannelState(page) {
  const helpers = getChatHelperScript();
  return page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const lockNode = findNodeByPath(paths.channelLock);
    const unlockNode = findNodeByPath(paths.channelUnlock);
    const checkAll = findNodeByPath(paths.channelAllToggle + '/Checkmark');
    const checkVip = findNodeByPath(paths.channelVIPToggle + '/Checkmark');
    const unlockActive = !!unlockNode?.active;
    const locked = !unlockActive;
    const vipChecked = !!checkVip?.active;
    const allChecked = !!checkAll?.active;
    const channel = vipChecked ? '4-5' : 'all';
    return {
      locked,
      unlockActive,
      channel,
      allChecked,
      vipChecked
    };
  }, { paths: CHAT_PATHS, helperScript: helpers });
}

async function getChannelState(page) {
  await ensureChannelPanel(page);
  const state = await readChannelState(page);
  await closeChannelPanel(page);
  return state;
}

async function setChannel(page, targetChannel) {
  const helpers = getChatHelperScript();
  const desired = targetChannel === '4-5' ? '4-5' : 'all';

  const openResult = await ensureChannelPanel(page);

  const result = await page.evaluate(({ paths, helperScript, channel }) => {
    eval(helperScript);
    const toggleAllNode = findNodeByPath(paths.channelAllToggle);
    const toggleVIPNode = findNodeByPath(paths.channelVIPToggle);
    const lock = findNodeByPath(paths.channelLock);
    const unlock = findNodeByPath(paths.channelUnlock);

    if (!toggleAllNode || !toggleVIPNode) {
      return { success: false, error: 'Channel toggles not found' };
    }

    if (channel === '4-5' && (lock?.active || !unlock?.active)) {
      return { success: false, locked: true };
    }

    const targetNode = channel === '4-5' ? toggleVIPNode : toggleAllNode;
    const touch = createTouchEvent(targetNode);
    targetNode.emit(cc.Node.EventType.TOUCH_START, touch);
    targetNode.emit(cc.Node.EventType.TOUCH_END, touch);

    return { success: true };
  }, { paths: CHAT_PATHS, helperScript: helpers, channel: desired });

  if (!result?.success) {
    await closeChannelPanel(page);
    if (result?.locked) {
      return { locked: true, ...await readChannelState(page) };
    }
    throw new Error(result?.error || '切換頻道失敗');
  }

  await page.waitForFunction(({ paths, helperScript, channel }) => {
    eval(helperScript);
    const allCheck = findNodeByPath(paths.channelAllToggle + '/Checkmark');
    const vipCheck = findNodeByPath(paths.channelVIPToggle + '/Checkmark');
    if (channel === '4-5') {
      return !!vipCheck?.active && !allCheck?.active;
    }
    return !!allCheck?.active && !vipCheck?.active;
  }, { paths: CHAT_PATHS, helperScript: helpers, channel: desired }, { timeout: 2000 });

  const state = await readChannelState(page);
  await page.waitForTimeout(400);
  if (!openResult?.alreadyOpen) {
    await closeChannelPanel(page);
  }
  await page.waitForTimeout(300);
  return { locked: false, ...state };
}

async function sendTextMessage(page, text) {
  const helpers = getChatHelperScript();
  const focusResult = await page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const inputBox = findNodeByPath(paths.inputBox);
    const sendButton = findNodeByPath(paths.sendButton);
    if (!inputBox || !sendButton) {
      return { success: false, error: 'InputBox 或 SendButton 未找到' };
    }
    const touch = createTouchEvent(inputBox);
    inputBox.emit(cc.Node.EventType.TOUCH_START, touch);
    inputBox.emit(cc.Node.EventType.TOUCH_END, touch);
    return { success: true };
  }, { paths: CHAT_PATHS, helperScript: helpers });

  if (!focusResult?.success) {
    throw new Error(`文字輸入框聚焦失敗: ${focusResult?.error || '未知錯誤'}`);
  }

  await page.waitForTimeout(100);

  const typedViaKeyboard = await page.evaluate((message) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.value = '';
      return true;
    }
    return false;
  }, text);

  if (typedViaKeyboard) {
    await page.keyboard.type(text);
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active && active.blur) active.blur();
    });
  } else {
    // Fallback：直接更新 Label（若存在）
    const fallback = await page.evaluate(({ paths, helperScript, message }) => {
      eval(helperScript);
      const inputBox = findNodeByPath(paths.inputBox);
      if (!inputBox) {
        return { success: false, error: 'InputBox 未找到' };
      }
      const labelInput = findNodeRecursive(inputBox, 'LabelInput')?.getComponent(cc.Label);
      const labelPlaceholder = findNodeRecursive(inputBox, 'LabelPlaceholder')?.getComponent(cc.Label);
      if (labelInput) {
        labelInput.string = message;
        if (labelPlaceholder) labelPlaceholder.string = '';
        return { success: true };
      }
      return { success: false, error: '未找到 LabelInput' };
    }, { paths: CHAT_PATHS, helperScript: helpers, message: text });

    if (!fallback?.success) {
      throw new Error(`文字發送失敗: ${fallback?.error || '輸入框未能設定文字'}`);
    }
  }

  await page.waitForTimeout(500);

  const clickResult = await page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const sendButton = findNodeByPath(paths.sendButton);
    if (!sendButton) {
      return { success: false, error: 'SendButton 未找到' };
    }
    // 檢查按鈕是否可用（檢查 active 和 opacity）
    const buttonActive = sendButton.active !== false;
    const buttonOpacity = typeof sendButton.opacity === 'number' ? sendButton.opacity : 255;
    if (!buttonActive || buttonOpacity < 100) {
      return { success: false, error: `SendButton 不可用 (active: ${buttonActive}, opacity: ${buttonOpacity})` };
    }
    const touch = createTouchEvent(sendButton);
    sendButton.emit(cc.Node.EventType.TOUCH_START, touch);
    sendButton.emit(cc.Node.EventType.TOUCH_END, touch);
    return { success: true, buttonActive, buttonOpacity };
  }, { paths: CHAT_PATHS, helperScript: helpers });

  if (!clickResult?.success) {
    throw new Error(`文字發送失敗: ${clickResult?.error || '未知錯誤'}`);
  }

  // 發送後等待更長時間，確保訊息被處理
  await page.waitForTimeout(300);
}

async function sendEmoji(page, indexOrName) {
  const helpers = getChatHelperScript();
  const result = await page.evaluate(({ paths, helperScript, target }) => {
    eval(helperScript);
    const emojiButton = findNodeByPath(paths.emojiButton);
    const emojiContainer = findNodeByPath(paths.emojiContainer);
    if (!emojiButton || !emojiContainer) {
      return { success: false, error: 'Emoji 按鈕或列表未找到' };
    }
    const buttonTouch = createTouchEvent(emojiButton);
    emojiButton.emit(cc.Node.EventType.TOUCH_START, buttonTouch);
    emojiButton.emit(cc.Node.EventType.TOUCH_END, buttonTouch);
    const items = emojiContainer.children || [];
    if (!items.length) {
      return { success: false, error: 'Emoji 列表為空' };
    }
    let selected = null;
    if (typeof target === 'string') {
      selected = items.find(node => {
        const sprite = node.getComponent(cc.Sprite);
        return sprite?.spriteFrame?.name === target;
      });
    } else {
      const idx = Math.max(0, Math.min(items.length - 1, Number(target) - 1));
      selected = items[idx];
    }
    if (!selected) {
      selected = items[0];
    }
    const sprite = selected.getComponent(cc.Sprite);
    const spriteName = sprite?.spriteFrame?.name || null;
    const touch = createTouchEvent(selected);
    selected.emit(cc.Node.EventType.TOUCH_START, touch);
    selected.emit(cc.Node.EventType.TOUCH_END, touch);
    return { success: true, spriteName };
  }, { paths: CHAT_PATHS, helperScript: helpers, target: indexOrName });

  if (!result?.success) {
    throw new Error(`表情發送失敗: ${result?.error || '未知錯誤'}`);
  }
  return result.spriteName || null;
}

async function closeEmojiPanel(page) {
  const helpers = getChatHelperScript();
  const result = await page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const emojiList = findNodeByPath(paths.emojiList);
    if (!emojiList) {
      return { success: false, error: 'EmojiList 未找到' };
    }
    if (!emojiList.active) {
      return { success: true, alreadyClosed: true };
    }
    const emojiButton = findNodeByPath(paths.emojiButton);
    if (!emojiButton) {
      return { success: false, error: 'Emoji 按鈕未找到' };
    }
    const touch = createTouchEvent(emojiButton);
    emojiButton.emit(cc.Node.EventType.TOUCH_START, touch);
    emojiButton.emit(cc.Node.EventType.TOUCH_END, touch);
    return { success: true, alreadyClosed: false };
  }, { paths: CHAT_PATHS, helperScript: helpers });

  if (!result?.success) {
    throw new Error(result?.error || 'Emoji 面板關閉失敗');
  }

  if (!result.alreadyClosed) {
    await page.waitForTimeout(150);
  }
}

async function fetchChatMessages(page) {
  const helpers = getChatHelperScript();
  return page.evaluate(({ paths, helperScript }) => {
    eval(helperScript);
    const container = findNodeByPath(paths.messageContainer);
    if (!container) return [];
    const nodes = (container.children || []).filter(node => {
      if (!node.active || !node.activeInHierarchy) return false;
      const opacity = typeof node.opacity === 'number' ? node.opacity : 255;
      return opacity > 0;
    });
    return nodes.map(node => {
      const result = { type: 'unknown', rawName: node.name };
      if (node.name.includes('ChatMessageEmojiItem')) {
        const emojiSprite = findNodeRecursive(node, 'ImageEmoji')?.getComponent(cc.Sprite);
        result.type = 'emoji';
        result.spriteFrame = emojiSprite?.spriteFrame?.name || null;
      } else {
        const contentLabel = findNodeRecursive(node, 'LabelContent')?.getComponent(cc.Label);
        result.type = 'text';
        result.content = contentLabel?.string || '';
      }
      return result;
    });
  }, { paths: CHAT_PATHS, helperScript: helpers });
}

async function waitForMessageCount(page, expectedCount, timeoutMs = 4000) {
  const helpers = getChatHelperScript();
  await page.waitForFunction(({ paths, helperScript, expected }) => {
    eval(helperScript);
    const container = findNodeByPath(paths.messageContainer);
    if (!container) return expected === 0;
    const nodes = (container.children || []).filter(node => {
      if (!node.active || !node.activeInHierarchy) return false;
      const opacity = typeof node.opacity === 'number' ? node.opacity : 255;
      return opacity > 0;
    });
    return nodes.length === expected;
  }, { paths: CHAT_PATHS, helperScript: helpers, expected: expectedCount }, { timeout: timeoutMs });
  return fetchChatMessages(page);
}

async function waitForNewMessage(page, previousCount, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = await fetchChatMessages(page);
    if (messages.length > previousCount) {
      return messages;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('等待新訊息超時');
}

module.exports = {
  CHAT_PATHS,
  getChatHelperScript,
  readMessageCoolDown,
  ensureChatWindow,
  getChatWindowState,
  getChannelState,
  setChannel,
  sendTextMessage,
  sendEmoji,
  closeEmojiPanel,
  closeChannelPanel,
  fetchChatMessages,
  waitForMessageCount,
  waitForNewMessage,
};


