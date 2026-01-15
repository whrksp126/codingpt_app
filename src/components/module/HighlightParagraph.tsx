import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as SvgIcons from '../../assets/SvgIcon';


interface HighlightParagraphProps {
    module: {
        id: number;
        type: string;
        content: string;
        icon?: {
            name: string;
            size?: number;
            fill?: string;
            backgroundSize?: number;
            backgroundColor?: string;
        };
        tts?: {
            url: string;
            timestamps?: {
                alignment: {
                    words?: any[];
                    characters?: any[];
                };
            };
        };
    };
    currentAudioTime: number;
}

const START_THRESHOLD = 0.1;

import { HighlightTextRenderer } from './HighlightTextRenderer';

export const HighlightParagraph: React.FC<HighlightParagraphProps> = ({ module, currentAudioTime }) => {
    // Icon rendering
    const renderIcon = () => {
        if (!module.icon) return null;
        const { name, size = 32, fill, backgroundSize, backgroundColor } = module.icon;
        const SvgIcon = (SvgIcons as any)[name];
        if (!SvgIcon) return null;

        return (
            <View style={[styles.iconContainer, { backgroundColor, width: backgroundSize, height: backgroundSize, borderRadius: (backgroundSize || 64) / 2 }]}>
                <SvgIcon width={size} height={size} fill={fill} />
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {renderIcon()}

            <View style={styles.textWrapper}>
                <HighlightTextRenderer
                    content={module.content}
                    ttsData={module.tts}
                    currentAudioTime={currentAudioTime}
                    baseStyle={styles.centerText}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    textWrapper: {
        width: '100%',
    },
    centerText: {
        textAlign: 'center',
    },
});
