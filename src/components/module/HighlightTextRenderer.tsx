
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { parseHtmlAndMapAlignment } from '../../utils/textHighlightUtils';

interface HighlightTextRendererProps {
    content: string;
    ttsData?: {
        url: string;
        timestamps?: {
            alignment: {
                words?: any[];
                characters?: any[];
            };
        };
    };
    currentAudioTime: number;
    baseStyle?: object;
    highlightColor?: string;
    inactiveColor?: string;
}

const START_THRESHOLD = 0.1;

export const HighlightTextRenderer: React.FC<HighlightTextRendererProps> = ({
    content,
    ttsData,
    currentAudioTime,
    baseStyle = {},
    highlightColor, // If not provided, uses color from HTML or default
    inactiveColor = '#cccccc',
}) => {
    // Determine mode: character if characters data exists, otherwise word.
    // Default to word if neither (though unlikely if tts exists with alignment).
    const highlightMode = ttsData?.timestamps?.alignment?.characters ? 'char' : 'word';
    const alignmentData = highlightMode === 'char'
        ? ttsData?.timestamps?.alignment?.characters
        : ttsData?.timestamps?.alignment?.words;

    // Memoize parsed elements
    const parsedElements = useMemo(() => {
        if (!alignmentData) return [];
        // Deep copy alignment data to avoid mutation issues if any
        const dataCopy = JSON.parse(JSON.stringify(alignmentData));
        return parseHtmlAndMapAlignment(content, dataCopy, highlightMode as 'word' | 'char');
    }, [content, alignmentData, highlightMode]);

    if (!parsedElements.length) {
        // If parsing fails or no data, just render text? 
        // Or return null to let parent handle fallback?
        // Let's render simple text for safety, or return null to signal fallback.
        return null;
    }

    return (
        <Text style={[styles.textBase, baseStyle]}>
            {parsedElements.map((item, index) => {
                if (item.isBreak) return <Text key={index}>{'\n'}</Text>;

                const isActive = currentAudioTime >= item.start && currentAudioTime >= START_THRESHOLD;

                const { color: originalColor, ...otherStyles } = item.style || {};
                const finalColor = highlightColor || originalColor || '#333333';

                return (
                    <Text
                        key={`${highlightMode}-${index}`}
                        style={{
                            ...otherStyles,
                            color: isActive ? finalColor : inactiveColor
                        }}
                    >
                        {item.text}
                    </Text>
                );
            })}
        </Text>
    );
};

const styles = StyleSheet.create({
    textBase: {
        // Default base styles if needed
    },
});
