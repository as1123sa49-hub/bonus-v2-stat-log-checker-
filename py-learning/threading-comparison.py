"""
Python 多執行緒對比範例
對比：有鎖 vs 無鎖的情況
"""

import threading
import time

print("=" * 50)
print("範例 1：沒有鎖（可能會有競爭條件）")
print("=" * 50)

# 沒有鎖的版本
balance_no_lock = 100

def withdraw_no_lock(amount):
    global balance_no_lock
    print(f"正在處理領錢: {amount}")
    current_balance = balance_no_lock
    # 模擬一些處理時間
    time.sleep(0.001)  # 0.001 秒
    new_balance = current_balance - amount
    balance_no_lock = new_balance

# 模擬兩個動作同時發生
t1 = threading.Thread(target=withdraw_no_lock, args=(50,))
t2 = threading.Thread(target=withdraw_no_lock, args=(80,))

t1.start()
t2.start()
t1.join()
t2.join()

print(f"最終餘額（無鎖）: {balance_no_lock}")
print(f"預期餘額: -30 (100 - 50 - 80)")
print(f"實際餘額: {balance_no_lock}")
print()

print("=" * 50)
print("範例 2：有鎖（保護共享資源）")
print("=" * 50)

# 有鎖的版本
balance_with_lock = 100
account_lock = threading.Lock()

def withdraw_with_lock(amount):
    global balance_with_lock
    with account_lock:
        print(f"正在處理領錢: {amount}")
        current_balance = balance_with_lock
        # 模擬一些處理時間
        time.sleep(0.001)  # 0.001 秒
        new_balance = current_balance - amount
        balance_with_lock = new_balance

# 模擬兩個動作同時發生
t1 = threading.Thread(target=withdraw_with_lock, args=(50,))
t2 = threading.Thread(target=withdraw_with_lock, args=(80,))

t1.start()
t2.start()
t1.join()
t2.join()

print(f"最終餘額（有鎖）: {balance_with_lock}")
print(f"預期餘額: -30 (100 - 50 - 80)")
print(f"實際餘額: {balance_with_lock}")



