"""
Python 多執行緒範例 - 鎖（Lock）的使用
展示如何使用 threading.Lock() 來保護共享資源，避免競爭條件（race condition）
"""

import threading

# 這是我們要競爭的資源：股票帳戶餘額
balance = 100

# 建立一把鎖
account_lock = threading.Lock()

def withdraw(amount):
    global balance
    
    # --- 如果不加下面這行 Lock，這就是非原子性的流程 ---
    with account_lock:
        print(f"正在處理領錢: {amount}")
        current_balance = balance
        
        # 故意製造一個極小的運算延遲，讓電腦有機會在此時切換到另一個執行緒
        new_balance = current_balance - amount
        balance = new_balance
    # ---------------------------------------------

# 模擬兩個動作同時發生
t1 = threading.Thread(target=withdraw, args=(50,))
t2 = threading.Thread(target=withdraw, args=(80,))

t1.start()
t2.start()

t1.join()
t2.join()

print(f"最終餘額: {balance}")



