import React from 'react';

import styles from './index.module.less';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    hover?: boolean;
    gradient?: boolean;
}

const Card: React.FC<CardProps> = ({
    children,
    className = '',
    onClick,
    hover = true,
    gradient = false
}) => {
    const cardClass = [
        styles.card,
        hover ? styles.hover : '',
        gradient ? styles.gradient : '',
        className
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cardClass}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {children}
        </div>
    );
};

export default Card;
