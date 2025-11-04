import os
import sys
from PIL import Image
import cairosvg

def create_iconset(svg_path, iconset_path):
    """
    从 SVG 创建 icon.iconset 目录，并生成所有必要的 PNG 文件。
    """
    try:
        # 创建 icon.iconset 目录
        if not os.path.exists(iconset_path):
            os.makedirs(iconset_path)
            print(f"创建目录: {iconset_path}")
        else:
            print(f"目录已存在: {iconset_path}")

        # 定义需要生成的图标尺寸和对应的文件名
        icon_sizes = [
            (16, "icon_16x16.png"),
            (32, "icon_16x16@2x.png"),
            (32, "icon_32x32.png"),
            (64, "icon_32x32@2x.png"),
            (128, "icon_128x128.png"),
            (256, "icon_128x128@2x.png"),
            (256, "icon_256x256.png"),
            (512, "icon_256x256@2x.png"),
            (512, "icon_512x512.png"),
            (1024, "icon_512x512@2x.png")
        ]

        # 生成每个尺寸的 PNG 文件
        for size, filename in icon_sizes:
            output_png = os.path.join(iconset_path, filename)
            print(f"生成 {output_png} ...")
            
            # 计算实际尺寸（考虑@2x的情况）
            actual_size = size
            if '@2x' in filename:
                actual_size = size * 2

            # 使用 cairosvg 转换 SVG 为 PNG
            cairosvg.svg2png(
                url=svg_path,
                write_to=output_png,
                output_width=actual_size,
                output_height=actual_size,
                unsafe=True  # 允许更多SVG特性
            )

            # 打开生成的 PNG 并确保是 RGBA 模式
            img = Image.open(output_png)
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
                img.save(output_png)
        
        print("所有 PNG 文件已生成。")

    except Exception as e:
        print(f"创建 icon.iconset 过程中出错: {str(e)}")
        sys.exit(1)

def convert_iconset_to_icns(iconset_path, icns_path):
    """
    使用 iconutil 将 icon.iconset 转换为 .icns 文件。
    """
    try:
        # 检查 icon.iconset 是否存在
        if not os.path.exists(iconset_path):
            print(f"错误: 找不到目录 {iconset_path}")
            sys.exit(1)

        # 使用 iconutil 生成 .icns 文件
        cmd = f"iconutil -c icns '{iconset_path}' -o '{icns_path}'"
        print(f"运行命令: {cmd}")
        result = os.system(cmd)

        if result != 0:
            print("iconutil 转换失败。")
            sys.exit(1)
        else:
            print(f"成功创建 .icns 文件: {icns_path}")

    except Exception as e:
        print(f"转换 icon.iconset 为 .icns 过程中出错: {str(e)}")
        sys.exit(1)

def convert_svg_to_ico(svg_path, ico_path, sizes=[16, 32, 48, 64, 128, 256]):
    """
    将 SVG 转换为 ICO 文件。
    """
    try:
        # 创建临时目录
        temp_dir = 'temp_ico'
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
            print(f"创建临时目录: {temp_dir}")
        else:
            print(f"临时目录已存在: {temp_dir}")

        images = []
        
        # 为每个尺寸生成 PNG
        for size in sizes:
            output_png = os.path.join(temp_dir, f'icon_{size}.png')
            print(f"生成 {output_png} ...")
            
            # 使用 cairosvg 转换（支持渐变）
            cairosvg.svg2png(
                url=svg_path,
                write_to=output_png,
                output_width=size,
                output_height=size,
                unsafe=True  # 允许更多SVG特性
            )
            
            # 打开生成的 PNG
            img = Image.open(output_png)
            
            # 确保图像模式是 RGBA
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            images.append(img)

        # 生成 ICO 文件
        images[0].save(
            ico_path,
            format='ICO',
            append_images=images[1:],
            sizes=[(size, size) for size in sizes]
        )

        print(f"成功创建 ICO 文件: {ico_path}")
        print(f"包含的尺寸: {sizes}")

        # 清理临时文件
        for size in sizes:
            temp_file = os.path.join(temp_dir, f'icon_{size}.png')
            if os.path.exists(temp_file):
                os.remove(temp_file)
        os.rmdir(temp_dir)
        print(f"已清理临时目录: {temp_dir}")

    except Exception as e:
        print(f"转换过程中出错: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    # 定义输入输出路径
    svg_file = 'icon.svg'
    ico_file = 'app.ico'
    iconset_dir = 'icon.iconset'
    icns_file = 'icon.icns'

    # 检查输入文件是否存在
    if not os.path.exists(svg_file):
        print(f"错误: 找不到输入文件 {svg_file}")
        sys.exit(1)

    # 创建 icon.iconset 并生成 PNG 文件
    create_iconset(svg_file, iconset_dir)

    # 使用 iconutil 生成 .icns 文件
    convert_iconset_to_icns(iconset_dir, icns_file)

    # 可选: 生成 ICO 文件
    convert_svg_to_ico(svg_file, ico_file)
