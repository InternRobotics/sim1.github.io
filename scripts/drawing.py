import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import curve_fit
import seaborn as sns
from matplotlib.lines import Line2D # 导入 Line2D 用于创建图例句柄
import matplotlib.ticker as ticker # 导入 ticker 用于设置更密集的对数刻度

# --- 1. 数据准备 (修改) ---
real_data_size = 10  # 初始点 D 值 (新范围: 50-10000)

# 原始分数和数据量
name = "gtrs_dense_res"

# base 分数（对应 data = 0，新范围: 0-1）
base_score = 0.01

# 原始分数和数据量 (新范围: y轴0-1, x轴50-10000)
# 注意：请根据实际数据修改以下数值
# 域内pi05
# scores = {
#     'Real': [0.6, 0.733, 0.966, 0.9, 0.933],
#     'Sim':      [0.533, 0.7, 0.866],
#     'Gen':       [0., 0., 0.0625, 0.5, 0.666, 0.85, 0.75, 0.907]
# }
# data_blocks = {
#     'Real': [50, 100, 200, 300, 1000],  
#     'Sim':      [50, 100, 200],  
#     'Gen':       [200, 300, 500, 1000, 2000, 3000, 5000, 10000]  
# }

# pi05纹理
scores = {
    'Real': [0.6, 0.43, 0.767, 0.5, 0.67],
    'Sim':      [0.633, 0.67, 0.833],
    'Gen':       [0.0, 0.0, 0.86, 0.904,0.86,0.952]
}
data_blocks = {
    'Real': [50, 100, 200, 500, 1000],  
    'Sim':      [50, 100, 200],  
    'Gen':       [200, 300, 500, 2000,3000,5000]  
}



#域外pi05位置
# scores = {
#     'Real': [0.333, 0.266, 0.433, 0.4, 0.3, 0.33],
#     'Sim':      [0.233, 0.4, 0.4],
#     # 'Gen':       [0., 0., 0.0625, 0.55, 0.666, 0.85, 0.75, 0.907]
# }
# data_blocks = {
#     'Real': [50, 100, 200, 300, 500, 1000],  
#     'Sim':      [50, 100, 200],  
#     # 'Gen':       [200, 300, 500, 1000, 2000, 3000, 5000, 10000]  
# }

# --- 自定义散点数据 (可选) ---
# 格式: [(x1, y1), (x2, y2), ...]
# 这些散点不会参与拟合，仅用于显示
custom_scatter_points = [
    # 示例：添加你的自定义散点
    (100, 0.5),
    # (500, 0.7),
    # (2000, 0.8),
]



# 累积数据量 (关键修改：从 real_data_size 基线开始累加)
# 注意：根据你的数据结构，data_blocks可能是绝对位置而不是增量
# 如果是绝对位置，请设置 use_absolute=True
def get_cum_data(key, use_absolute=True):
    if use_absolute:
        # data_blocks 中的值是绝对位置
        # 如果第一个值等于 real_data_size，则跳过第一个值避免重复
        # 否则，第一个点仍然是 real_data_size (对应 base_score)
        if len(data_blocks[key]) > 0 and data_blocks[key][0] == real_data_size:
            D_values = [real_data_size] + data_blocks[key]
        else:
            D_values = [real_data_size] + data_blocks[key]
    else:
        # data_blocks 中的值是增量，需要累积
        # 初始点 D = real_data_size (对应 base_score)
        # 后续点 D = real_data_size + 累积的增量数据
        cumulative_increase = list(np.cumsum(data_blocks[key]))
        D_values = [real_data_size] + [real_data_size + inc for inc in cumulative_increase]

    print(f"DEBUG {key}: data_blocks={data_blocks[key]}")
    print(f"DEBUG {key}: D_values={D_values}")
    return D_values

# --- 2. 拟合函数 (不变) ---
# Score = a * (log D)^2 + b * (log D) + c
def log_quad_scaling(D, a, b, c):
    log_D = np.log10(D) 
    return a * log_D**2 + b * log_D + c

# --- 3. 拟合和绘图函数 (修改: 调整 D_fit 的范围) ---
def fit_and_plot_log_quad(ax, label, D_full, score_full, color, linestyle, marker):

    # 关键修改：使用所有点进行拟合和绘图
    D = np.array(D_full)
    score = np.array(score_full)

    # 拟合参数 (调整以适应新的y轴范围0-1)
    p0 = [0, 0.2, 0.3] 

    # 拟合约束
    bounds = ([-np.inf, -np.inf, -np.inf], [np.inf, np.inf, np.inf])

    # 执行拟合
    popt, _ = curve_fit(log_quad_scaling, D, score, p0=p0, maxfev=5000, bounds=bounds)
    a_fit, b_fit, c_fit = popt

    # --- 打印拟合结果 ---
    print(f"--- {label} Log-Quad Fit ---")
    print(f"Score = {a_fit:.4e} * (log10 D)^2 + {b_fit:.4f} * (log10 D) + {c_fit:.4f}")

    # --- 计算固定误差 EPSILON (残差标准差) ---
    score_fit_points = log_quad_scaling(D, *popt)
    residuals = score - score_fit_points
    EPSILON = np.std(residuals)

    print(f"Calculated Fixed EPSILON (Residual StdDev): {EPSILON:.4e}")

    # --- 绘制拟合曲线 (关键修改: D_min 从 D.min() 开始) ---
    D_min, D_max = D.min(), D.max()
    # 拟合曲线从 D_min 开始，延伸到略高于 D_max
    D_fit = np.linspace(D_min, D_max * 1.1, 200) # 从 D_min 开始
    score_fit = log_quad_scaling(D_fit, *popt)

    # 统一使用实线 '-'
    ax.plot(
        D_fit, score_fit, color=color, linestyle='-', 
        linewidth=6, alpha=1  # 按比例增加线宽
    )

    # --- 绘制固定误差带 (使用计算出的 EPSILON) ---
    ax.fill_between(
        D_fit, 
        score_fit - 1 * EPSILON, # 下限
        score_fit + 1 * EPSILON, # 上限
        color=color, 
        alpha=0.05, 
        zorder=0 
    )

    # --- 绘制数据点 ---
    # 点放大 (按比例增加)
    ax.scatter(D, score, color=color, marker=marker, s=240, edgecolor='white', linewidths=2, zorder=10)

    # --- 寻找和标记拐点 (D_opt) ---
    if a_fit < 0:
        log_D_opt = -b_fit / (2 * a_fit)
        D_opt = 10**log_D_opt
        Score_opt = log_quad_scaling(D_opt, a_fit, b_fit, c_fit)

        # 打印拐点信息 (不绘制拐点)
        print(f"D_opt (Max Score Point): {D_opt:.2e} (Score: {Score_opt:.4f})")
    else:
        print("D_opt (Max Score Point): None (a is non-negative)")

    print("-" * (len(label) + 20))

    return D_min, D_max

# --- 绘制自定义散点函数 ---
def plot_custom_scatter(ax, points, color='#90EE90', size=240, line_length_ratio=0.15):
    """
    绘制自定义散点，使用六边形标记，并添加横线穿过散点

    参数:
    - ax: matplotlib axes对象
    - points: 散点列表，格式为 [(x1, y1), (x2, y2), ...]
    - color: 散点颜色，默认为浅绿色 '#90EE90'
    - size: 散点大小
    - line_length_ratio: 横线长度相对于散点大小的比例
    """
    if not points:
        return

    # 提取x和y坐标
    x_coords = [p[0] for p in points]
    y_coords = [p[1] for p in points]

    # 先绘制横线（在散点下面，这样散点会覆盖在横线上）
    x_lim = ax.get_xlim()
    y_lim = ax.get_ylim()

    # 使用对数轴的x范围需要特殊处理
    if ax.get_xscale() == 'log':
        # 对于对数轴，在对数空间中计算相对长度
        for x, y in points:
            # 在对数空间中，使用x值的百分比，横线长度增加50%
            line_length_x = x * line_length_ratio * 0.8 * 1.5  # 增加50%
            x_start = x - line_length_x / 2
            x_end = x + line_length_x / 2
            # 使用与散点相同的颜色，zorder设为14（低于散点的15）
            ax.plot([x_start, x_end], [y, y], color=color, linewidth=5, 
                    alpha=0.9, zorder=14, solid_capstyle='round')
    else:
        # 线性轴，横线长度增加50%
        x_range = x_lim[1] - x_lim[0]
        line_length_x = x_range * line_length_ratio * 1.5  # 增加50%
        for x, y in points:
            x_start = x - line_length_x / 2
            x_end = x + line_length_x / 2
            # 使用与散点相同的颜色，zorder设为14（低于散点的15）
            ax.plot([x_start, x_end], [y, y], color=color, linewidth=5, 
                    alpha=0.9, zorder=14, solid_capstyle='round')

    # 然后绘制六边形散点（在横线上面，zorder=15）
    ax.scatter(x_coords, y_coords, color=color, marker='h', s=size, 
               edgecolor='white', linewidths=2, zorder=15, alpha=0.9)

# --- 4. 绘图主体和样式配置 (保持不变) ---
sns.set_theme(style="whitegrid")

# 颜色配置
colors_hex = ['#BFBFBF','#CAACC5','#806D9B']

config = [
    {'label': 'Real', 'color': colors_hex[0], 'marker': 'o'},
    {'label': 'Sim',      'color': colors_hex[1], 'marker': 's'},
    {'label': 'Gen',       'color': colors_hex[2], 'marker': '^'}
]

# 提升分辨率：图像尺寸和DPI都增加2倍，保持视觉比例
# plt.figure(figsize=(16, 12), dpi=800)
plt.figure(figsize=(12, 12), dpi=800)
ax = plt.gca()
min_Ds, max_Ds = [], []

# 用于图例的句柄和标签列表
legend_handles = []
legend_labels = []

# 遍历绘制
for conf in config:
    label = conf['label']

    # 检查数据是否存在
    if label not in scores or label not in data_blocks:
        print(f"Warning: {label} data not found, skipping...")
        continue

    # 关键修改：score_full 包含基线 score
    # 如果 data_blocks 是绝对位置，设置 use_absolute=True
    # 如果 data_blocks 是增量，设置 use_absolute=False
    D_full = get_cum_data(label, use_absolute=True)  # 根据实际情况修改
    score_full = [base_score] + scores[label]

    # 调试信息：打印数据对应关系
    print(f"\n=== {label} Data Alignment ===")
    print(f"D values: {D_full}")
    print(f"Score values: {score_full}")
    for i, (d, s) in enumerate(zip(D_full, score_full)):
        print(f"  Point {i}: D={d}, Score={s}")
    print("=" * 30)

    D_min, D_max = fit_and_plot_log_quad(
        ax, label, D_full, score_full, 
        conf['color'], '-', conf['marker']
    )
    min_Ds.append(D_min)
    max_Ds.append(D_max)

    # 填充图例列表
    handle = Line2D([0], [0], color=conf['color'], marker=conf['marker'], 
                    linestyle='--', linewidth=12, markersize=24)  # 按比例增加 
    legend_handles.append(handle)
    legend_labels.append(conf['label'])

# --- 5. 设置范围和标记 (修改: 调整 X 轴和 Y 轴范围) ---
min_D_overall = min(min_Ds)
max_D_overall = max(max_Ds)

# X 轴范围: 50 到 10000
x_min_limit = 50
x_max_limit = 10000
plt.xlim(x_min_limit, x_max_limit) 
ax.set_xscale('log') # Log X 轴

# 设置X轴刻度格式，使用科学计数法
ax.xaxis.set_major_formatter(ticker.LogFormatterSciNotation())
ax.xaxis.set_minor_formatter(ticker.NullFormatter()) # 次要刻度不显示标签
# 设置主要刻度位置，使其在对数轴上均匀分布
ax.xaxis.set_major_locator(ticker.LogLocator(base=10, numticks=15))
# 增大刻度文字大小（按比例增加以保持视觉大小）
ax.tick_params(axis='both', which='major', labelsize=32)
ax.tick_params(axis='both', which='minor', labelsize=28)

# Y 轴范围: 0 到 1
y_min_limit = 0.0
y_max_limit = 1.0
plt.ylim(y_min_limit, y_max_limit)

# 去掉边框 (保留底部和左侧，移除顶部和右侧)
for spine in ['top', 'right']:
    ax.spines[spine].set_visible(False)

# 设置左侧和底部边框的颜色和线宽（按比例增加）
for spine in ['left', 'bottom']:
    ax.spines[spine].set_color('black')
    ax.spines[spine].set_linewidth(2.0) 

# 开启竖直网格线，使用对数轴的次要刻度线
ax.grid(True, axis='y', linestyle='--', alpha=0.6) # 水平网格线
ax.grid(True, axis='x', which='minor', linestyle='--', alpha=0.4) # 竖直网格线

# --- 绘制自定义散点 (如果有的话) ---
if custom_scatter_points:
    plot_custom_scatter(ax, custom_scatter_points, color='#90EE90', size=240)

plt.tight_layout()

# 保存为svg（提升分辨率）
plt.savefig('svg_gtrs_res.svg', format='svg', dpi=800)