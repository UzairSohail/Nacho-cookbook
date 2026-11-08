import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors, { Fonts } from '@/constants/Colors';

type IconName = SymbolViewProps['name'];

const icon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={26} />;
  };

export default function TabLayout() {
  const c = Colors[useColorScheme()];
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.tabIconDefault,
        headerTitleStyle: { fontFamily: Fonts.title, fontSize: 22 },
        tabBarLabelStyle: { fontFamily: Fonts.bodyMedium },
        // Avoid a hydration mismatch from statically rendering the header on web.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Recipes',
          tabBarIcon: icon({ ios: 'book', android: 'menu_book', web: 'menu_book' }),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: 'Planner',
          tabBarIcon: icon({ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }),
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: 'Shopping',
          tabBarIcon: icon({ ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: icon({ ios: 'gearshape', android: 'settings', web: 'settings' }),
        }}
      />
    </Tabs>
  );
}
