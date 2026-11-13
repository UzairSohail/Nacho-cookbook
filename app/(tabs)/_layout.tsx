import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, useTheme, type IconName } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';

const TABS: Record<string, { title: string; icon: IconName }> = {
  index: { title: 'Recipes', icon: 'recipes' },
  planner: { title: 'Planner', icon: 'planner' },
  list: { title: 'Shopping', icon: 'shopping' },
  settings: { title: 'Settings', icon: 'settings' },
};

/** A floating dark pill. The current tab grows to show its name; the others are icons. */
function FloatingTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: c.ink }]}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.title}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [
                styles.item,
                focused && [styles.itemOn, { backgroundColor: c.onInk }],
                { opacity: pressed ? 0.7 : 1 },
              ]}>
              <Icon name={tab.icon} size={22} color={focused ? c.ink : c.inkMuted} />
              {focused ? <Text style={[styles.label, { color: c.ink }]}>{tab.title}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Recipes' }} />
      <Tabs.Screen name="planner" options={{ title: 'Planner' }} />
      <Tabs.Screen name="list" options={{ title: 'Shopping' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 20 },
  bar: {
    width: '100%',
    maxWidth: 440,
    height: 68,
    borderRadius: 34,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#241A12',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: { height: 48, minWidth: 56, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  itemOn: { paddingHorizontal: 18 },
  label: { fontFamily: Fonts.bodyBold, fontSize: 14 },
});
