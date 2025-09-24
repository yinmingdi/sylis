import { create, useModal } from '@ebay/nice-modal-react'

import VirtualPopover, { type VirtualPopoverProps } from '../../virtual-popover';

export interface WordHelperProps {
    word: string;
    reference: VirtualPopoverProps['reference'];
}

export const WordHelper = create(({ word, reference }: WordHelperProps) => {
    const modal = useModal();

    return (
        <VirtualPopover
            reference={reference}
            visible={modal.visible}
            onExited={() => modal.remove()}
            onClickOutside={() => modal.hide()}
        >
            <div>
                <h1>{word}</h1>
            </div>
        </VirtualPopover>
    )

})
