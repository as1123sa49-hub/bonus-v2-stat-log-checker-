const { test, expect } = require('@playwright/test');
const testConfigModule = require('../../config/testConfig');
const TEST_CONFIG = testConfigModule;
const { ACCOUNTS, buildGameUrl } = testConfigModule;
const { initWebSocketMonitoring, waitForNewOpenRound } = require('../../src/helpers/webSocketHelper');
const { splitBetAmount, clickOpenBettingButton, placeBet } = require('../../src/helpers/bettingHelper');
const { createRoomPathHelperScript } = require('../../src/helpers/cocosHelper');
const { loginGame, closePWAPopup } = require('../../src/helpers/loginHelper');
const { enterRoom } = require('../../src/helpers/roomHelper');
const logger = require('../../src/utils/logger');
const chatHelper = require('../../src/helpers/chatHelper');
const {
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
  fetchChatMessages,
  waitForNewMessage,
} = chatHelper;

const CHAT_ROOM = 'CG500X';
const TEXT_MESSAGES = ['All channel text', 'VIP channel text', 'All channel return text'];
const EMOJI_SEQUENCE = ['emoji_03', 'emoji_07', 'emoji_05'];
const QUICK_BET_AMOUNT = 50;
const QUICK_BET_AREA = '804';

// 時間常數
const DELAY_AFTER_ACTION = 500; // 操作後延遲
const DELAY_AFTER_CHANNEL_SWITCH = 400; // 切換頻道後延遲
const DELAY_FOR_MESSAGE_RECEIVE = 1000; // 等待訊息接收
const DELAY_AFTER_EMOJI_CLOSE = 500; // 關閉表情面板後延遲
const DELAY_FINAL = 300; // 最終延遲

// 測試模式設定
// 單帳號測試: '1' 或 'true'
// 雙帳號測試: 不設置環境變數，或設置為 '0'、'false' 或其他值
const SINGLE_ACCOUNT_MODE = process.env.CHAT_SINGLE_ACCOUNT === '0' || process.env.CHAT_SINGLE_ACCOUNT === 'true';

async function ensureChatVisible(page, logger, opts = {}) {
  const { minMessages = 0 } = opts;
  let state = await getChatWindowState(page);
  if (!state.openIcon) {
    await ensureChatWindow(page, 'on');
    await page.waitForTimeout(300);
    state = await getChatWindowState(page);
  }
  expect(state.openIcon).toBeTruthy();

  let messages = await fetchChatMessages(page);
  if (messages.length < minMessages) {
    logger?.info('聊天視窗未顯示內容，重整 ChatSwitchButton');
    await ensureChatWindow(page, 'off');
    await page.waitForTimeout(200);
    await ensureChatWindow(page, 'on');
    await page.waitForTimeout(400);
    state = await getChatWindowState(page);
    messages = await fetchChatMessages(page);
  }

  return { state, messages };
}

// 檢查 BlockInputMask 狀態的輔助函數
async function checkBlockInputMask(page) {
  return await page.evaluate(({ paths, helperScript }) => {
    try {
      eval(helperScript);
      const inputBox = findNodeByPath(paths.inputBox);
      if (!inputBox) return { needsBet: false, error: 'InputBox not found' };
      const blockInputMask = inputBox.getChildByName('BlockInputMask');
      if (!blockInputMask) return { needsBet: false, error: 'BlockInputMask not found' };
      const isActive = blockInputMask.active === true;
      return { needsBet: isActive, blockInputMaskActive: isActive };
    } catch (e) {
      return { needsBet: false, error: e.message };
    }
  }, { paths: CHAT_PATHS, helperScript: getChatHelperScript() });
}

async function selectChipForQuickBet(page, chipSprite) {
  const helperScript = createRoomPathHelperScript();
  const result = await page.evaluate(({ helperScriptStr, chipSprite }) => {
    return new Promise((resolve) => {
      try {
        const helpersFactory = new Function(helperScriptStr + '\nreturn { getRoomView, getNodeByRoomPath };');
        const { getRoomView, getNodeByRoomPath } = helpersFactory();
        const roomView = getRoomView();
        if (!roomView) {
          resolve({ success: false, error: 'Room view not found' });
          return;
        }
        const container = getNodeByRoomPath(roomView, 'chipSelectorPath');
        if (!container) {
          resolve({ success: false, error: 'Chip container not found' });
          return;
        }

        const items = container.children || [];
        let targetChipNode = null;
        let targetIndex = -1;
        for (let i = 0; i < items.length; i++) {
          const chipComp = items[i];
          const chipNode = chipComp.getChildByName('Chip');
          if (!chipNode) continue;
          const icon = chipNode.getChildByName('icon');
          const sprite = icon?.getComponent(cc.Sprite);
          if (sprite && sprite.spriteFrame && sprite.spriteFrame.name.includes(chipSprite)) {
            targetChipNode = chipComp;
            targetIndex = i;
            break;
          }
        }

        if (!targetChipNode) {
          resolve({ success: false, error: `Chip sprite ${chipSprite} not found` });
          return;
        }

        let scrollViewNode = targetChipNode.parent;
        while (scrollViewNode && scrollViewNode.name !== 'ScrollView') {
          scrollViewNode = scrollViewNode.parent;
        }
        const scrollViewComp = scrollViewNode?.getComponent?.(cc.ScrollView);
        if (scrollViewComp && targetIndex > 0) {
          const totalChips = targetChipNode.parent.children.length;
          if (totalChips > 1) {
            const ratio = targetIndex / (totalChips - 1);
            if (scrollViewComp.scrollToPercentHorizontal) {
              scrollViewComp.scrollToPercentHorizontal(ratio, 0.4, true);
            }
          }
        }

        setTimeout(() => {
          try {
            const chipForSelectorComp = targetChipNode.getComponent('ChipForSelectorComp');
            if (chipForSelectorComp && chipForSelectorComp.handleTouch) {
              chipForSelectorComp.handleTouch();
              resolve({ success: true });
            } else {
              resolve({ success: false, error: 'handleTouch not found on chip' });
            }
          } catch (err) {
            resolve({ success: false, error: err?.message || 'select timeout error' });
          }
        }, 180);
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  }, { helperScriptStr: helperScript, chipSprite });

  if (!result?.success) {
    throw new Error(`快速下注選籌碼失敗: ${result?.error || '未知錯誤'}`);
  }

  await page.waitForTimeout(220);
}

async function clickBetAreaForQuickBet(page, betArea) {
  const helperScript = createRoomPathHelperScript();
  const result = await page.evaluate(({ helperScriptStr, betArea }) => {
    try {
      const helpersFactory = new Function(helperScriptStr + '\nreturn { getRoomView, getNodeByRoomPath };');
      const { getRoomView, getNodeByRoomPath } = helpersFactory();
      const roomView = getRoomView();
      if (!roomView) {
        return { success: false, error: 'Room view not found' };
      }
      const sensorGroup = getNodeByRoomPath(roomView, 'betAreaPath');
      if (!sensorGroup) {
        return { success: false, error: 'SensorGroup not found' };
      }
      const targetAreaNode = sensorGroup.getChildByName(betArea);
      if (!targetAreaNode) {
        const availableAreas = sensorGroup.children ? sensorGroup.children.map(node => node.name).join(', ') : 'unknown';
        return { success: false, error: `Bet area ${betArea} not found`, availableAreas };
      }
      const touch = new cc.Touch(targetAreaNode.x || 0, targetAreaNode.y || 0, 1);
      const touchStart = new cc.Event.EventTouch([touch], false);
      touchStart.type = cc.Node.EventType.TOUCH_START;
      targetAreaNode.dispatchEvent(touchStart);
      const touchEnd = new cc.Event.EventTouch([touch], false);
      touchEnd.type = cc.Node.EventType.TOUCH_END;
      targetAreaNode.dispatchEvent(touchEnd);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, { helperScriptStr: helperScript, betArea });

  if (!result?.success) {
    throw new Error(`快速下注點擊區域失敗: ${result?.error || '未知錯誤'}`);
  }

  await page.waitForTimeout(150);
}

async function performQuickBetForChat(page, logger, room, amount = QUICK_BET_AMOUNT, area = QUICK_BET_AREA) {
  logger.info(`   下注 ${amount}，區域 ${area}`);
  try {
    await clickOpenBettingButton(page, room);
  } catch (err) {
    logger.warning(`   開盤按鈕失敗: ${err.message || err}`, { prefix: '   ' });
  }

  const chips = splitBetAmount(amount);
  for (const chip of chips) {
    await selectChipForQuickBet(page, chip.sprite);
    await clickBetAreaForQuickBet(page, area);
  }
  await page.waitForTimeout(600);
}

async function ensureChatUnlockedIfNeeded(page, logger, { userLevel, room, cooldownMs }) {
  if (!userLevel || userLevel >= 4) {
    return;
  }

  logger.info(`[L${userLevel}] 檢查發話資格`);

  // 檢查 BlockInputMask 是否為 active（active 表示需要下注）
  const needsBet = await checkBlockInputMask(page);

  if (needsBet.error) {
    logger.warning(`   BlockInputMask 檢查失敗: ${needsBet.error}`, { prefix: '   ' });
  } else if (!needsBet.needsBet) {
    logger.info(`   ✓ 已具備發話資格`);
    return;
  } else {
    logger.info(`   ✗ 需要下注解鎖`);
  }

  const waitForCooldown = async () => {
    if (cooldownMs && cooldownMs > 0) {
      await page.waitForTimeout(cooldownMs + 200);
    } else {
      await page.waitForTimeout(1200);
    }
  };

  await waitForCooldown();

  logger.info('   等待新局...');
  try {
    await waitForNewOpenRound(page, room, null, 60);
  } catch (_) {
    logger.warning('   等待新局失敗，仍嘗試下注', { prefix: '   ' });
  }

  // 再次確認是否已解鎖（有時上一局下注後已可發話）
  const secondCheck = await checkBlockInputMask(page);
  const secondCheckUnlocked = !secondCheck.needsBet;

  if (secondCheckUnlocked) {
    logger.info('   ✓ 已解鎖，跳過下注');
    await waitForCooldown();
    return;
  } else if (secondCheck.error) {
    logger.warning(`   檢查失敗: ${secondCheck.error}`, { prefix: '   ' });
  }

  let unlockSucceeded = false;
  for (let attempt = 0; attempt < 2 && !unlockSucceeded; attempt++) {
    if (attempt > 0) {
      logger.info('   重試下注 (第 2 次)');
      try {
        await waitForNewOpenRound(page, room, null, 60);
      } catch (_) {
        logger.warning('   等待新局失敗', { prefix: '   ' });
      }
    }

    let quickBetDone = false;
    try {
      await performQuickBetForChat(page, logger, room);
      quickBetDone = true;
    } catch (quickBetError) {
      logger.warning(`   快速下注失敗: ${quickBetError.message || quickBetError}`, { prefix: '   ' });
      try {
        logger.info('   改用標準下注');
        const betResult = await placeBet(page, [{ area: QUICK_BET_AREA, amount: QUICK_BET_AMOUNT }], room, TEST_CONFIG.areaNames || {});
        if (betResult?.success) {
          quickBetDone = true;
        } else {
          logger.warning('   標準下注失敗', { prefix: '   ' });
        }
      } catch (fallbackError) {
        logger.warning(`   標準下注失敗: ${fallbackError.message || fallbackError}`, { prefix: '   ' });
      }
    }

    if (!quickBetDone) {
      logger.warning('   下注未執行，將重試', { prefix: '   ' });
    }

    await waitForCooldown();

    // 檢查 BlockInputMask 是否變為非 active（表示已解鎖）
    const unlockCheck = await checkBlockInputMask(page);
    const isUnlocked = !unlockCheck.needsBet;

    if (isUnlocked) {
      logger.success(`   ✓ 解鎖成功`);
      unlockSucceeded = true;
    } else if (unlockCheck.error) {
      logger.warning(`   檢查失敗: ${unlockCheck.error}`, { prefix: '   ' });
    } else {
      logger.warning(`   ✗ 仍未解鎖`, { prefix: '   ' });
    }

    await waitForCooldown();
  }

  if (!unlockSucceeded) {
    throw new Error('下注後 BlockInputMask 仍為 active，聊天功能未解鎖');
  }
}

test.describe('聊天室功能測試', () => {
  test(`${CHAT_ROOM} - 發話/表情/視窗/Channel`, async ({ page, browser }) => {
    test.setTimeout(180000);

    const primaryAccountKey = TEST_CONFIG.accountInfo.key;
    const singleAccountMode = SINGLE_ACCOUNT_MODE;
    const fallbackSecondKey = primaryAccountKey === 'default' ? 'betting' : 'default';
    const secondAccountKeyRaw = process.env.TEST_ACCOUNT_SECOND;
    const secondAccountKey = secondAccountKeyRaw || fallbackSecondKey;
    const secondAccount = singleAccountMode ? null : ACCOUNTS[secondAccountKey];
    if (!singleAccountMode) {
      expect(secondAccount, `找不到第二帳號設定 (${secondAccountKey})`).toBeTruthy();
      if (secondAccountKey === primaryAccountKey) {
        throw new Error(`第二帳號 (${secondAccountKey}) 不能與主要帳號相同，請調整 TEST_ACCOUNT 或 TEST_ACCOUNT_SECOND`);
      }
    } else {
      logger.info('啟用單帳號模式 (CHAT_SINGLE_ACCOUNT=1)，跳過第二帳號流程');
    }

    const secondGameUrl = secondAccount ? buildGameUrl(secondAccount) : null;
    const secondContext = singleAccountMode ? null : await browser.newContext({ viewport: { width: 414, height: 896 } });
    const secondPage = singleAccountMode ? null : await secondContext.newPage();

    try {
      // 主帳號登入
      await page.setViewportSize({ width: 414, height: 896 });
      await initWebSocketMonitoring(page);
      await loginGame(page, TEST_CONFIG.gameUrl);
      await closePWAPopup(page);

      const roomResult = await enterRoom(page, CHAT_ROOM);
      expect(roomResult.success).toBe(true);
      logger.success(`[主帳號:${primaryAccountKey}] 已進入聊天室測試房間`);

      // 在第一帳號讀取到大廳列表後，等待1秒再開啟第二帳號
      if (!singleAccountMode && roomResult.lobbyListRead) {
        logger.info('第一帳號已讀取到大廳列表，等待1秒後開啟第二帳號');
        await page.waitForTimeout(1000);
      }

      const cooldownMs = await readMessageCoolDown(page, CHAT_ROOM);
      logger.info(`聊天室冷卻時間: ${cooldownMs} ms`);

      await ensureChatWindow(page, 'on');
      await page.waitForTimeout(500);
      await ensureChatVisible(page, logger, { minMessages: 0 });

      const primaryAccount = ACCOUNTS[primaryAccountKey] || {};

      // 第二帳號應該在主帳號預檢之前就登入，以便接收訊息
      if (!singleAccountMode) {
        await initWebSocketMonitoring(secondPage);
        await loginGame(secondPage, secondGameUrl);
        await closePWAPopup(secondPage);
        const secondRoomResult = await enterRoom(secondPage, CHAT_ROOM);
        expect(secondRoomResult.success).toBe(true);
        logger.success(`[第二帳號:${secondAccountKey}] 已進入聊天室測試房間`);

        await ensureChatWindow(secondPage, 'on');
        await secondPage.waitForTimeout(500);
        await ensureChatVisible(secondPage, logger, { minMessages: 0 });

        // 確保第二帳號可以發話（如果需要下注）
        await ensureChatUnlockedIfNeeded(secondPage, logger, {
          userLevel: secondAccount.userLevel,
          room: CHAT_ROOM,
          cooldownMs
        });
      }

      await ensureChatUnlockedIfNeeded(page, logger, {
        userLevel: primaryAccount.userLevel,
        room: CHAT_ROOM,
        cooldownMs
      });

      let primaryMessages = await fetchChatMessages(page);
      let secondaryMessages = singleAccountMode ? [] : await fetchChatMessages(secondPage);

      const waitAfterCooldown = async () => {
        if (cooldownMs > 0) {
          await page.waitForTimeout(cooldownMs + 200);
          if (!singleAccountMode) {
            await secondPage.waitForTimeout(cooldownMs + 200);
          }
        } else {
          await page.waitForTimeout(1200);
          if (!singleAccountMode) {
            await secondPage.waitForTimeout(1200);
          }
        }
      };

      const verifyBothSides = async ({ type, text, emoji, shouldReceive = true, channel = 'all' }) => {
        if (singleAccountMode) {
          return;
        }
        if (!shouldReceive) {
          const beforeCount = secondaryMessages.length;
          await page.waitForTimeout(DELAY_FOR_MESSAGE_RECEIVE);
          const afterMessages = await fetchChatMessages(secondPage);
          expect(afterMessages.length).toBe(beforeCount);
          logger.info(`   → [L${secondAccount.userLevel}] ✗ (預期不接收)`);
          return;
        }
        const beforeCount = secondaryMessages.length;
        secondaryMessages = await waitForNewMessage(secondPage, secondaryMessages.length);
        await ensureChatVisible(secondPage, logger, { minMessages: secondaryMessages.length ? 1 : 0 });
        const latestSecondary = secondaryMessages[secondaryMessages.length - 1];
        expect(latestSecondary.type).toBe(type);
        if (type === 'text') {
          expect(latestSecondary.content).toBe(text);
          logger.success(`   → [L${secondAccount.userLevel}] ✓`);
        } else if (type === 'emoji' && emoji) {
          expect(latestSecondary.spriteFrame).toBe(emoji);
          logger.success(`   → [L${secondAccount.userLevel}] ✓`);
        }
      };

      // 發送表情並驗證的輔助函數
      const sendEmojiAndVerify = async (page, emojiName, channelLabel, userLevel, messagesRef, shouldReceive = true) => {
        const emojiResult = await sendEmoji(page, emojiName);
        await page.waitForTimeout(DELAY_AFTER_ACTION);
        messagesRef.current = await waitForNewMessage(page, messagesRef.current.length);
        await ensureChatVisible(page, logger, { minMessages: 1 });
        const latestEmoji = messagesRef.current[messagesRef.current.length - 1];
        expect(latestEmoji.type).toBe('emoji');
        if (emojiResult) {
          expect(latestEmoji.spriteFrame).toBe(emojiResult);
        }
        logger.success(`📤 [L${userLevel}][${channelLabel}] 表情: ${emojiResult || emojiName}`);
        await verifyBothSides({ 
          type: 'emoji', 
          emoji: emojiResult || emojiName, 
          channel: channelLabel.toLowerCase(),
          shouldReceive
        });
        await closeEmojiPanel(page);
        await page.waitForTimeout(DELAY_AFTER_EMOJI_CLOSE);
      };

      // 發送文字並驗證的輔助函數
      const sendTextAndVerify = async (page, text, channelLabel, userLevel, messagesRef, shouldReceive = true) => {
        await sendTextMessage(page, text);
        await page.waitForTimeout(DELAY_AFTER_ACTION);
        messagesRef.current = await waitForNewMessage(page, messagesRef.current.length);
        await ensureChatVisible(page, logger, { minMessages: 1 });
        const latestText = messagesRef.current[messagesRef.current.length - 1];
        expect(latestText.type).toBe('text');
        expect(latestText.content).toBe(text);
        logger.success(`📤 [L${userLevel}][${channelLabel}] 文字: ${text}`);
        await verifyBothSides({ 
          type: 'text', 
          text, 
          channel: channelLabel.toLowerCase(),
          shouldReceive
        });
      };

      // Channel = All，先發表情
      logger.info('━━━ Channel All 測試 ━━━');
      const primaryMessagesRef = { current: primaryMessages };
      await sendEmojiAndVerify(page, EMOJI_SEQUENCE[0], 'All', primaryAccount.userLevel, primaryMessagesRef);
      primaryMessages = primaryMessagesRef.current;
      await waitAfterCooldown();

      // Channel = All，發送文字
      const textAll = TEXT_MESSAGES[0];
      await sendTextAndVerify(page, textAll, 'All', primaryAccount.userLevel, primaryMessagesRef);
      primaryMessages = primaryMessagesRef.current;

      await waitAfterCooldown();

        // 切換 Channel = 4-5（若可用）
      const channelStateBefore = await getChannelState(page);
      if (!channelStateBefore.locked) {
        const channelStateAfter = await setChannel(page, '4-5');
        await page.waitForTimeout(DELAY_AFTER_CHANNEL_SWITCH);
        expect(channelStateAfter.channel).toBe('4-5');

        if (!singleAccountMode) {
          // 檢查第二帳號的 Channel 狀態
          const secondChannelStateBefore = await getChannelState(secondPage);
          if (!secondChannelStateBefore.locked) {
            const secondChannelStateAfter = await setChannel(secondPage, '4-5');
            await secondPage.waitForTimeout(DELAY_AFTER_CHANNEL_SWITCH);
            expect(secondChannelStateAfter.channel).toBe('4-5');
          } else {
            logger.info(`   [L${secondAccount.userLevel}] Channel 鎖定，無法切換到 4-5`);
          }
        }

        primaryMessages = await fetchChatMessages(page);
        await ensureChatVisible(page, logger, { minMessages: 0 });
        if (!singleAccountMode) {
          secondaryMessages = await fetchChatMessages(secondPage);
          await ensureChatVisible(secondPage, logger, { minMessages: 0 });
        }

        await waitAfterCooldown();

        // Channel 4-5，先發表情
        logger.info('━━━ Channel 4-5 測試 ━━━');
        // 根據規則：Channel = 4-5，userLevel 1-3 發話 → userLevel 4-5 玩家不會收到
        //            Channel = 4-5，userLevel 4-5 發話 → userLevel 1-5 玩家會收到
        const primaryUserLevel = primaryAccount.userLevel || 0;
        const secondUserLevel = secondAccount?.userLevel || 0;
        // 如果發話者是 userLevel 4-5，所有玩家都會收到
        // 如果發話者是 userLevel 1-3，只有 userLevel 1-3 的玩家會收到（userLevel 4-5 不會收到）
        const shouldReceiveInVipChannel = primaryUserLevel >= 4 || secondUserLevel <= 3;
        
        await sendEmojiAndVerify(page, EMOJI_SEQUENCE[1], 'VIP', primaryAccount.userLevel, primaryMessagesRef, shouldReceiveInVipChannel);
        primaryMessages = primaryMessagesRef.current;
        await waitAfterCooldown();

        const vipText = TEXT_MESSAGES[1];
        await sendTextAndVerify(page, vipText, 'VIP', primaryAccount.userLevel, primaryMessagesRef, shouldReceiveInVipChannel);
        primaryMessages = primaryMessagesRef.current;

        await waitAfterCooldown();

        // 如果第二帳號是 userLevel 1-3，讓第二帳號發話（在 Channel All，因為無法切換到 4-5），確認主帳號（在 Channel 4-5）是否收到
        if (!singleAccountMode && secondUserLevel <= 3) {
          logger.info('━━━ 反向驗證：L1-3 發話 → L4-5 接收 ━━━');
          const secondVipText = `VIP-${secondAccountKey}-${Date.now()}`;
          const secondVipEmojiName = await sendEmoji(secondPage, EMOJI_SEQUENCE[0]);
          await secondPage.waitForTimeout(DELAY_AFTER_ACTION);
          secondaryMessages = await waitForNewMessage(secondPage, secondaryMessages.length);
          await ensureChatVisible(secondPage, logger, { minMessages: secondaryMessages.length ? 1 : 0 });
          const latestSecondVipEmoji = secondaryMessages[secondaryMessages.length - 1];
          expect(latestSecondVipEmoji.type).toBe('emoji');
          logger.success(`📤 [L${secondUserLevel}][All] 表情: ${secondVipEmojiName || EMOJI_SEQUENCE[0]}`);
          
          // 檢查主帳號（在 Channel 4-5）是否收到（根據規則，userLevel 1-3 在 Channel All 發話，主帳號在 Channel 4-5 不會收到）
          const primaryBeforeCount = primaryMessages.length;
          await page.waitForTimeout(DELAY_FOR_MESSAGE_RECEIVE);
          const primaryAfterMessages = await fetchChatMessages(page);
          const primaryReceived = primaryAfterMessages.length > primaryBeforeCount;
          if (primaryReceived) {
            logger.warning(`   → [L${primaryUserLevel}][VIP] ✗ (不應收到)`);
          } else {
            logger.success(`   → [L${primaryUserLevel}][VIP] ✗ (符合預期)`);
          }
          expect(primaryAfterMessages.length).toBe(primaryBeforeCount);

          await closeEmojiPanel(secondPage);
          await secondPage.waitForTimeout(DELAY_AFTER_EMOJI_CLOSE);
          await waitAfterCooldown();

          await sendTextMessage(secondPage, secondVipText);
          await secondPage.waitForTimeout(DELAY_AFTER_ACTION);
          secondaryMessages = await waitForNewMessage(secondPage, secondaryMessages.length);
          await ensureChatVisible(secondPage, logger, { minMessages: secondaryMessages.length ? 1 : 0 });
          const latestSecondVipText = secondaryMessages[secondaryMessages.length - 1];
          expect(latestSecondVipText.type).toBe('text');
          // 遊戲可能會過濾敏感詞，使用 includes 檢查是否包含關鍵部分
          const timestampPart = secondVipText.split('-').pop();
          expect(latestSecondVipText.content).toContain('VIP-');
          expect(latestSecondVipText.content).toContain(timestampPart);
          logger.success(`📤 [L${secondUserLevel}][All] 文字: ${latestSecondVipText.content}`);
          
          // 檢查主帳號（在 Channel 4-5）是否收到
          const primaryBeforeCount2 = primaryMessages.length;
          await page.waitForTimeout(DELAY_FOR_MESSAGE_RECEIVE);
          const primaryAfterMessages2 = await fetchChatMessages(page);
          const primaryReceived2 = primaryAfterMessages2.length > primaryBeforeCount2;
          if (primaryReceived2) {
            logger.warning(`   → [L${primaryUserLevel}][VIP] ✗ (不應收到)`);
          } else {
            logger.success(`   → [L${primaryUserLevel}][VIP] ✗ (符合預期)`);
          }
          expect(primaryAfterMessages2.length).toBe(primaryBeforeCount2);

          await waitAfterCooldown();
        }

        const finalChannelState = await setChannel(page, 'all');
        await page.waitForTimeout(DELAY_AFTER_CHANNEL_SWITCH);
        expect(finalChannelState.channel).toBe('all');

        if (!singleAccountMode) {
          // 檢查第二帳號的 Channel 狀態，如果之前無法切換到 4-5，則不需要切換回 all
          const secondChannelStateCheck = await getChannelState(secondPage);
          if (secondChannelStateCheck.channel !== 'all') {
            const secondFinalChannelState = await setChannel(secondPage, 'all');
            await secondPage.waitForTimeout(DELAY_AFTER_CHANNEL_SWITCH);
            expect(secondFinalChannelState.channel).toBe('all');
          }
        }

        primaryMessages = await fetchChatMessages(page);
        await ensureChatVisible(page, logger, { minMessages: 0 });
        if (!singleAccountMode) {
          secondaryMessages = await fetchChatMessages(secondPage);
          await ensureChatVisible(secondPage, logger, { minMessages: 0 });
        }

        await waitAfterCooldown();

        // Channel All（返回），先發表情
        logger.info('━━━ Channel All（返回）測試 ━━━');
        await sendEmojiAndVerify(page, EMOJI_SEQUENCE[2], 'All', primaryAccount.userLevel, primaryMessagesRef);
        primaryMessages = primaryMessagesRef.current;
        await waitAfterCooldown();

        const returnText = TEXT_MESSAGES[2];
        await sendTextAndVerify(page, returnText, 'All', primaryAccount.userLevel, primaryMessagesRef);
        primaryMessages = primaryMessagesRef.current;

        await waitAfterCooldown();
      } else {
        logger.info('Channel 為鎖定狀態，跳過 4-5 測試');
      }

      await page.waitForTimeout(DELAY_FINAL);
      const finalMessages = await fetchChatMessages(page);
      const totalMessages = finalMessages.length || primaryMessages.length;
      expect(totalMessages).toBeGreaterThan(0);
    } finally {
      if (secondContext) {
        await secondContext.close();
      }
    }
  });
});
