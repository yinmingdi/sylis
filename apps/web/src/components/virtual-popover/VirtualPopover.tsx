import { createPopper } from '@popperjs/core';
import type { Instance as PopperInstance } from '@popperjs/core';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CSSTransition } from 'react-transition-group';

import styles from './index.module.less';

export interface VirtualRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface VirtualPopoverProps {
    reference: HTMLElement | VirtualRect | null;
    visible: boolean;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    offset?: [number, number];
    className?: string;
    children: React.ReactNode;
    onClickOutside?: () => void;
    arrow?: boolean;
    zIndex?: number;
    strategy?: 'absolute' | 'fixed';
    modifiers?: any[];
    onExited?: () => void;
}

// 创建虚拟元素用于 PopperJS
const createVirtualElement = (rect: VirtualRect) => ({
    getBoundingClientRect: () => ({
        x: rect.x,
        y: rect.y,
        top: rect.y,
        left: rect.x,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
        width: rect.width,
        height: rect.height,
        toJSON: () => rect,
    }),
    contextElement: document.body,
});

export const VirtualPopover: React.FC<VirtualPopoverProps> = ({
    reference,
    visible,
    placement = 'bottom',
    offset = [0, 8],
    className = '',
    children,
    onClickOutside,
    arrow = true,
    zIndex = 1000,
    strategy = 'absolute',
    modifiers = [],
    onExited,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const arrowRef = useRef<HTMLDivElement>(null);
    const popperInstanceRef = useRef<PopperInstance | null>(null);
    const [popoverMounted, setPopoverMounted] = useState(false);

    // 创建 Popper 实例
    const createPopperInstance = useCallback(() => {
        if (!reference || !popoverRef.current) return;

        // 销毁之前的实例
        if (popperInstanceRef.current) {
            popperInstanceRef.current.destroy();
        }

        // 确定参考元素
        const referenceElement = isVirtualRect(reference)
            ? createVirtualElement(reference)
            : reference;

        // 默认修饰器
        const defaultModifiers = [
            {
                name: 'offset',
                options: {
                    offset,
                },
            },
            {
                name: 'preventOverflow',
                options: {
                    padding: 8,
                },
            },
            {
                name: 'flip',
                options: {
                    fallbackPlacements: ['top', 'bottom', 'left', 'right'],
                },
            },
            ...modifiers,
        ];

        // 如果需要箭头，添加箭头修饰器
        if (arrow && arrowRef.current) {
            defaultModifiers.push({
                name: 'arrow',
                options: {
                    element: arrowRef.current,
                    padding: 4,
                },
            });
        }

        // 创建 Popper 实例
        popperInstanceRef.current = createPopper(
            referenceElement as Element,
            popoverRef.current,
            {
                placement,
                strategy,
                modifiers: defaultModifiers,
            }
        );
    }, [reference, placement, offset, arrow, strategy, modifiers]);

    // 判断是否为虚拟矩形
    const isVirtualRect = (ref: any): ref is VirtualRect => {
        return ref && typeof ref === 'object' && 'x' in ref && 'y' in ref && 'width' in ref && 'height' in ref;
    };

    // 处理点击外部
    const handleClickOutside = useCallback((event: MouseEvent) => {
        if (
            popoverRef.current &&
            !popoverRef.current.contains(event.target as Node) &&
            onClickOutside
        ) {
            onClickOutside();
        }
    }, [onClickOutside]);

    // 组件挂载时设置
    useEffect(() => {
        setPopoverMounted(true);
        return () => {
            if (popperInstanceRef.current) {
                popperInstanceRef.current.destroy();
            }
        };
    }, []);

    // 监听可见性变化
    useEffect(() => {
        if (visible && popoverMounted) {
            createPopperInstance();

            // 添加点击外部监听
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            // 移除点击外部监听
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [visible, popoverMounted, createPopperInstance, handleClickOutside, onClickOutside]);

    // 更新 Popper 位置
    useEffect(() => {
        if (popperInstanceRef.current && visible) {
            popperInstanceRef.current.update();
        }
    }, [reference, visible]);

    if (!popoverMounted) {
        return null;
    }

    return (
        <CSSTransition
            in={visible}
            timeout={200}
            classNames={{
                enter: styles.popoverEnter,
                enterActive: styles.popoverEnterActive,
                exit: styles.popoverExit,
                exitActive: styles.popoverExitActive,
            }}
            unmountOnExit
            onExited={onExited}
        >
            <div
                ref={popoverRef}
                className={`${styles.popover} ${className}`}
                style={{ zIndex }}
                role="tooltip"
            >
                {arrow && (
                    <div
                        ref={arrowRef}
                        className={styles.arrow}
                        data-popper-arrow
                    />
                )}
                <div className={styles.content}>
                    {children}
                </div>
            </div>
        </CSSTransition>
    );
};

export default VirtualPopover;
