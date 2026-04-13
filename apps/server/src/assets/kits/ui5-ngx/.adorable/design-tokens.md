# SAP Horizon Theme — Design Tokens

Theme: `sap_horizon` (also available: `sap_horizon_dark`, `sap_horizon_hcb`, `sap_horizon_hcw`)

Set the theme at app startup:
```ts
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
setTheme('sap_horizon');
```

Use these CSS variables for any custom styling. Prefer semantic variables over hardcoded hex values.

## Chart (482)

- `--sapChart_Background`: `#fff`
- `--sapChart_ContrastTextShadow`: `0 0 .0625rem rgba(0,0,0,.7)`
- `--sapChart_ContrastShadowColor`: `#fff`
- `--sapChart_ContrastLineColor`: `#fff`
- `--sapChart_LineColor_1`: `#e1e6eb`
- `--sapChart_LineColor_2`: `#768da4`
- `--sapChart_LineColor_3`: `#000001`
- `--sapChart_Choropleth_Background`: `#edf0f3`
- `--sapChart_ChoroplethRegion_Background`: `#758ca4`
- `--sapChart_ChoroplethRegion_BorderColor`: `#edf0f3`
- `--sapChart_Data_TextColor`: `#000`
- `--sapChart_Data_ContrastTextColor`: `#fff`
- `--sapChart_Data_InteractiveColor`: `#000001`
- `--sapChart_Data_Active_Background`: `#dee2e5`
- `--sapChart_IBCS_Actual`: `#233649`
- `--sapChart_IBCS_Previous`: `#758ca4`
- `--sapChart_IBCS_Good`: `#287a40`
- `--sapChart_IBCS_Bad`: `#d00a0a`
- `--sapChart_OrderedColor_1`: `#168eff`
- `--sapChart_OrderedColor_2`: `#c87b00`
- ...and 462 more

## Button (172)

- `--sapButton_Background`: `#fff`
- `--sapButton_BorderColor`: `#bcc3ca`
- `--sapButton_BorderWidth`: `.0625rem`
- `--sapButton_BorderCornerRadius`: `.5rem`
- `--sapButton_TextColor`: `#0064d9`
- `--sapButton_FontFamily`: `"72-SemiboldDuplex", "72-SemiboldDuplexfull", "72", "72full", Arial, Helvetica, sans-serif`
- `--sapButton_Hover_Background`: `#eaecee`
- `--sapButton_Hover_BorderColor`: `#bcc3ca`
- `--sapButton_Hover_TextColor`: `#0064d9`
- `--sapButton_IconColor`: `#0064d9`
- `--sapButton_Active_Background`: `#fff`
- `--sapButton_Active_BorderColor`: `#0064d9`
- `--sapButton_Active_TextColor`: `#0064d9`
- `--sapButton_Emphasized_Background`: `#0070f2`
- `--sapButton_Emphasized_BorderColor`: `#0070f2`
- `--sapButton_Emphasized_BorderWidth`: `.0625rem`
- `--sapButton_Emphasized_TextColor`: `#fff`
- `--sapButton_Emphasized_FontFamily`: `"72-Bold", "72-Boldfull", "72", "72full", Arial, Helvetica, sans-serif`
- `--sapButton_Emphasized_Hover_Background`: `#0064d9`
- `--sapButton_Emphasized_Hover_BorderColor`: `#0064d9`
- ...and 152 more

## IndicationColor (160)

- `--sapIndicationColor_1`: `#840606`
- `--sapIndicationColor_1_Background`: `#840606`
- `--sapIndicationColor_1_BorderColor`: `#840606`
- `--sapIndicationColor_1_TextColor`: `#fff`
- `--sapIndicationColor_1_Hover_Background`: `#6c0505`
- `--sapIndicationColor_1_Active_Background`: `#fff`
- `--sapIndicationColor_1_Active_BorderColor`: `#fb9d9d`
- `--sapIndicationColor_1_Active_TextColor`: `#840606`
- `--sapIndicationColor_1_Selected_Background`: `#fff`
- `--sapIndicationColor_1_Selected_BorderColor`: `#fb9d9d`
- `--sapIndicationColor_1_Selected_TextColor`: `#840606`
- `--sapIndicationColor_1b`: `#fb9d9d`
- `--sapIndicationColor_1b_TextColor`: `#830707`
- `--sapIndicationColor_1b_Background`: `#fb9d9d`
- `--sapIndicationColor_1b_BorderColor`: `#fb9d9d`
- `--sapIndicationColor_1b_Hover_Background`: `#fa8585`
- `--sapIndicationColor_2`: `#aa0808`
- `--sapIndicationColor_2_Background`: `#aa0808`
- `--sapIndicationColor_2_BorderColor`: `#aa0808`
- `--sapIndicationColor_2_TextColor`: `#fff`
- ...and 140 more

## Content (115)

- `--sapContent_LineHeight`: `1.5`
- `--sapContent_IconHeight`: `1rem`
- `--sapContent_IconColor`: `#131e29`
- `--sapContent_ContrastIconColor`: `#fff`
- `--sapContent_NonInteractiveIconColor`: `#758ca4`
- `--sapContent_MarkerIconColor`: `#5d36ff`
- `--sapContent_MarkerTextColor`: `#046c7a`
- `--sapContent_MeasureIndicatorColor`: `#556b81`
- `--sapContent_Selected_MeasureIndicatorColor`: `#0064d9`
- `--sapContent_Placeholderloading_Background`: `#ccc`
- `--sapContent_Placeholderloading_Gradient`: `linear-gradient(to right, #ccc 0%, #ccc 20%, #999 50%, #ccc 80%, #ccc 100%)`
- `--sapContent_ImagePlaceholderBackground`: `#eaecee`
- `--sapContent_ImagePlaceholderForegroundColor`: `#556b82`
- `--sapContent_RatedColor`: `#d27700`
- `--sapContent_UnratedColor`: `#758ca4`
- `--sapContent_BusyColor`: `#0064d9`
- `--sapContent_FocusColor`: `#0032a5`
- `--sapContent_FocusStyle`: `solid`
- `--sapContent_FocusWidth`: `.125rem`
- `--sapContent_ContrastFocusColor`: `#fff`
- ...and 95 more

## Shell (111)

- `--sapShellColor`: `#fff`
- `--sapShell_Background`: `#eff1f2`
- `--sapShell_BackgroundImage`: `linear-gradient(to bottom, #eff1f2, #eff1f2)`
- `--sapShell_BackgroundImageOpacity`: `1`
- `--sapShell_BackgroundImageRepeat`: `false`
- `--sapShell_BorderColor`: `#d9d9d9`
- `--sapShell_TextColor`: `#131e29`
- `--sapShell_InteractiveBackground`: `#eff1f2`
- `--sapShell_InteractiveTextColor`: `#131e29`
- `--sapShell_InteractiveBorderColor`: `#556b81`
- `--sapShell_GroupTitleTextColor`: `#131e29`
- `--sapShell_GroupTitleTextShadow`: `0 0 .125rem #fff`
- `--sapShell_Hover_Background`: `#fff`
- `--sapShell_Active_Background`: `#fff`
- `--sapShell_Active_TextColor`: `#0070f2`
- `--sapShell_Selected_Background`: `#fff`
- `--sapShell_Selected_TextColor`: `#0070f2`
- `--sapShell_Selected_Hover_Background`: `#fff`
- `--sapShell_Favicon`: `none`
- `--sapShell_Navigation_Background`: `#fff`
- ...and 91 more

## Field (66)

- `--sapField_Background`: `#fff`
- `--sapField_BackgroundStyle`: `0 100% / 100% .0625rem no-repeat linear-gradient(0deg, #556b81, #556b81) border-box`
- `--sapField_TextColor`: `#131e29`
- `--sapField_PlaceholderTextColor`: `#556b82`
- `--sapField_BorderColor`: `#556b81`
- `--sapField_HelpBackground`: `#fff`
- `--sapField_BorderWidth`: `.0625rem`
- `--sapField_BorderStyle`: `none`
- `--sapField_BorderCornerRadius`: `.25rem`
- `--sapField_Shadow`: `inset 0 0 0 .0625rem rgba(85,107,129,.25)`
- `--sapField_Hover_Background`: `#fff`
- `--sapField_Hover_BackgroundStyle`: `0 100% / 100% .0625rem no-repeat linear-gradient(0deg, #0064d9, #0064d9) border-box`
- `--sapField_Hover_BorderColor`: `#0064d9`
- `--sapField_Hover_HelpBackground`: `#fff`
- `--sapField_Hover_Shadow`: `inset 0 0 0 .0625rem rgba(79,160,255,.5)`
- `--sapField_Hover_InvalidShadow`: `inset 0 0 0 .0625rem rgba(255,142,196,.45)`
- `--sapField_Hover_WarningShadow`: `inset 0 0 0 .0625rem rgba(255,213,10,.4)`
- `--sapField_Hover_SuccessShadow`: `inset 0 0 0 .0625rem rgba(48,145,76,.18)`
- `--sapField_Hover_InformationShadow`: `inset 0 0 0 .0625rem rgba(104,174,255,.5)`
- `--sapField_Active_BorderColor`: `#0064d9`
- ...and 46 more

## Avatar (43)

- `--sapAvatar_1_Background`: `#fff3b8`
- `--sapAvatar_1_BorderColor`: `#fff3b8`
- `--sapAvatar_1_TextColor`: `#a45d00`
- `--sapAvatar_1_Hover_Background`: `#fff3b8`
- `--sapAvatar_2_Background`: `#ffd0e7`
- `--sapAvatar_2_BorderColor`: `#ffd0e7`
- `--sapAvatar_2_TextColor`: `#aa0808`
- `--sapAvatar_2_Hover_Background`: `#ffd0e7`
- `--sapAvatar_3_Background`: `#ffdbe7`
- `--sapAvatar_3_BorderColor`: `#ffdbe7`
- `--sapAvatar_3_TextColor`: `#ba066c`
- `--sapAvatar_3_Hover_Background`: `#ffdbe7`
- `--sapAvatar_4_Background`: `#ffdcf3`
- `--sapAvatar_4_BorderColor`: `#ffdcf3`
- `--sapAvatar_4_TextColor`: `#a100c2`
- `--sapAvatar_4_Hover_Background`: `#ffdcf3`
- `--sapAvatar_5_Background`: `#ded3ff`
- `--sapAvatar_5_BorderColor`: `#ded3ff`
- `--sapAvatar_5_TextColor`: `#552cff`
- `--sapAvatar_5_Hover_Background`: `#ded3ff`
- ...and 23 more

## Legend (43)

- `--sapLegend_WorkingBackground`: `#fff`
- `--sapLegend_NonWorkingBackground`: `#ebebeb`
- `--sapLegend_CurrentDateTime`: `#a100c2`
- `--sapLegendColor1`: `#c35500`
- `--sapLegendColor2`: `#d23a0a`
- `--sapLegendColor3`: `#df1278`
- `--sapLegendColor4`: `#840606`
- `--sapLegendColor5`: `#cc00dc`
- `--sapLegendColor6`: `#0057d2`
- `--sapLegendColor7`: `#07838f`
- `--sapLegendColor8`: `#188918`
- `--sapLegendColor9`: `#5b738b`
- `--sapLegendColor10`: `#7800a4`
- `--sapLegendColor11`: `#a93e00`
- `--sapLegendColor12`: `#aa2608`
- `--sapLegendColor13`: `#ba066c`
- `--sapLegendColor14`: `#8d2a00`
- `--sapLegendColor15`: `#4e247a`
- `--sapLegendColor16`: `#002a86`
- `--sapLegendColor17`: `#035663`
- ...and 23 more

## Tab (32)

- `--sapTab_TextColor`: `#131e29`
- `--sapTab_ForegroundColor`: `#0064d9`
- `--sapTab_IconColor`: `#0064d9`
- `--sapTab_Background`: `#fff`
- `--sapTab_Selected_TextColor`: `#0064d9`
- `--sapTab_Selected_IconColor`: `#fff`
- `--sapTab_Selected_Background`: `#0064d9`
- `--sapTab_Selected_Indicator_Dimension`: `.1875rem`
- `--sapTab_Positive_TextColor`: `#256f3a`
- `--sapTab_Positive_ForegroundColor`: `#30914c`
- `--sapTab_Positive_IconColor`: `#30914c`
- `--sapTab_Positive_Selected_TextColor`: `#256f3a`
- `--sapTab_Positive_Selected_IconColor`: `#fff`
- `--sapTab_Positive_Selected_Background`: `#30914c`
- `--sapTab_Negative_TextColor`: `#aa0808`
- `--sapTab_Negative_ForegroundColor`: `#f53232`
- `--sapTab_Negative_IconColor`: `#f53232`
- `--sapTab_Negative_Selected_TextColor`: `#aa0808`
- `--sapTab_Negative_Selected_IconColor`: `#fff`
- `--sapTab_Negative_Selected_Background`: `#f53232`
- ...and 12 more

## Progress (31)

- `--sapProgress_Background`: `#d5dadd`
- `--sapProgress_BorderColor`: `#d5dadd`
- `--sapProgress_TextColor`: `#131e29`
- `--sapProgress_FontSize`: `.875rem`
- `--sapProgress_NegativeBackground`: `#ffdbec`
- `--sapProgress_NegativeBorderColor`: `#ffdbec`
- `--sapProgress_NegativeTextColor`: `#131e29`
- `--sapProgress_CriticalBackground`: `#fff4bd`
- `--sapProgress_CriticalBorderColor`: `#fff4bd`
- `--sapProgress_CriticalTextColor`: `#131e29`
- `--sapProgress_PositiveBackground`: `#e5f2ba`
- `--sapProgress_PositiveBorderColor`: `#e5f2ba`
- `--sapProgress_PositiveTextColor`: `#131e29`
- `--sapProgress_InformationBackground`: `#cdedff`
- `--sapProgress_InformationBorderColor`: `#cdedff`
- `--sapProgress_InformationTextColor`: `#131e29`
- `--sapProgress_Value_Background`: `#617b94`
- `--sapProgress_Value_BorderColor`: `#617b94`
- `--sapProgress_Value_TextColor`: `#788fa6`
- `--sapProgress_Value_NegativeBackground`: `#f53232`
- ...and 11 more

## List (26)

- `--sapList_HeaderBackground`: `#fff`
- `--sapList_HeaderBorderColor`: `#a8b2bd`
- `--sapList_HeaderTextColor`: `#131e29`
- `--sapList_BorderColor`: `#e5e5e5`
- `--sapList_BorderWidth`: `.0625rem`
- `--sapList_TextColor`: `#131e29`
- `--sapList_Active_TextColor`: `#131e29`
- `--sapList_Active_Background`: `#dee2e5`
- `--sapList_SelectionBackgroundColor`: `#ebf8ff`
- `--sapList_SelectionBorderColor`: `#0064d9`
- `--sapList_Hover_SelectionBackground`: `#dcf3ff`
- `--sapList_Background`: `#fff`
- `--sapList_Hover_Background`: `#eaecee`
- `--sapList_AlternatingBackground`: `#f5f6f7`
- `--sapList_GroupHeaderBackground`: `#fff`
- `--sapList_GroupHeaderBorderColor`: `#a8b2bd`
- `--sapList_GroupHeaderTextColor`: `#131e29`
- `--sapList_TableGroupHeaderBackground`: `#eff1f2`
- `--sapList_TableGroupHeaderBorderColor`: `#a8b2bd`
- `--sapList_TableGroupHeaderTextColor`: `#131e29`
- ...and 6 more

## Accent (20)

- `--sapAccentColor1`: `#d27700`
- `--sapAccentColor2`: `#aa0808`
- `--sapAccentColor3`: `#ba066c`
- `--sapAccentColor4`: `#a100c2`
- `--sapAccentColor5`: `#5d36ff`
- `--sapAccentColor6`: `#0057d2`
- `--sapAccentColor7`: `#046c7a`
- `--sapAccentColor8`: `#256f3a`
- `--sapAccentColor9`: `#6c32a9`
- `--sapAccentColor10`: `#5b738b`
- `--sapAccentBackgroundColor1`: `#fff3b8`
- `--sapAccentBackgroundColor2`: `#ffd0e7`
- `--sapAccentBackgroundColor3`: `#ffdbe7`
- `--sapAccentBackgroundColor4`: `#ffdcf3`
- `--sapAccentBackgroundColor5`: `#ded3ff`
- `--sapAccentBackgroundColor6`: `#d1efff`
- `--sapAccentBackgroundColor7`: `#c2fcee`
- `--sapAccentBackgroundColor8`: `#ebf5cb`
- `--sapAccentBackgroundColor9`: `#ddccf0`
- `--sapAccentBackgroundColor10`: `#eaecee`

## Assistant (18)

- `--sapAssistant_Color1`: `#5d36ff`
- `--sapAssistant_Color2`: `#a100c2`
- `--sapAssistant_BackgroundGradient`: `linear-gradient(#5d36ff, #a100c2)`
- `--sapAssistant_Background`: `#5d36ff`
- `--sapAssistant_BorderColor`: `#5d36ff`
- `--sapAssistant_TextColor`: `#fff`
- `--sapAssistant_Hover_Background`: `#2800cf`
- `--sapAssistant_Hover_BorderColor`: `#2800cf`
- `--sapAssistant_Hover_TextColor`: `#fff`
- `--sapAssistant_Active_Background`: `#fff`
- `--sapAssistant_Active_BorderColor`: `#5d36ff`
- `--sapAssistant_Active_TextColor`: `#5d36ff`
- `--sapAssistant_Question_Background`: `#eae5ff`
- `--sapAssistant_Question_BorderColor`: `#eae5ff`
- `--sapAssistant_Question_TextColor`: `#131e29`
- `--sapAssistant_Answer_Background`: `#eff1f2`
- `--sapAssistant_Answer_BorderColor`: `#eff1f2`
- `--sapAssistant_Answer_TextColor`: `#131e29`

## Font (16)

- `--sapFontFamily`: `"72", "72full", Arial, Helvetica, sans-serif`
- `--sapFontSize`: `.875rem`
- `--sapFontLightFamily`: `"72-Light", "72-Lightfull", "72", "72full", Arial, Helvetica, sans-serif`
- `--sapFontBoldFamily`: `"72-Bold", "72-Boldfull", "72", "72full", Arial, Helvetica, sans-serif`
- `--sapFontSemiboldFamily`: `"72-Semibold", "72-Semiboldfull", "72", "72full", Arial, Helvetica, sans-serif`
- `--sapFontSemiboldDuplexFamily`: `"72-SemiboldDuplex", "72-SemiboldDuplexfull", "72", "72full", Arial, Helvetica, sans-serif`
- `--sapFontBlackFamily`: `"72Black", "72Blackfull","72", "72full", Arial, Helvetica, sans-serif`
- `--sapFontHeaderFamily`: `"72-Bold", "72-Boldfull", "72", "72full", Arial, Helvetica, sans-serif`
- `--sapFontSmallSize`: `.75rem`
- `--sapFontLargeSize`: `1rem`
- `--sapFontHeader1Size`: `3rem`
- `--sapFontHeader2Size`: `2rem`
- `--sapFontHeader3Size`: `1.5rem`
- `--sapFontHeader4Size`: `1.25rem`
- `--sapFontHeader5Size`: `1rem`
- `--sapFontHeader6Size`: `.875rem`

## Slider (14)

- `--sapSlider_Background`: `#d5dadd`
- `--sapSlider_BorderColor`: `#d5dadd`
- `--sapSlider_Selected_Background`: `#0064d9`
- `--sapSlider_Selected_BorderColor`: `#0064d9`
- `--sapSlider_Selected_Dimension`: `.125rem`
- `--sapSlider_HandleBackground`: `#fff`
- `--sapSlider_HandleBorderColor`: `#b0d5ff`
- `--sapSlider_RangeHandleBackground`: `#fff`
- `--sapSlider_Hover_HandleBackground`: `#d9ecff`
- `--sapSlider_Hover_HandleBorderColor`: `#b0d5ff`
- `--sapSlider_Hover_RangeHandleBackground`: `#d9ecff`
- `--sapSlider_Active_HandleBackground`: `#fff`
- `--sapSlider_Active_HandleBorderColor`: `#0064d9`
- `--sapSlider_Active_RangeHandleBackground`: `transparent`

## Tile (14)

- `--sapTile_Background`: `#fff`
- `--sapTile_Hover_Background`: `#eaecee`
- `--sapTile_Active_Background`: `#dee2e5`
- `--sapTile_BorderColor`: `transparent`
- `--sapTile_BorderCornerRadius`: `1rem`
- `--sapTile_TitleTextColor`: `#131e29`
- `--sapTile_TextColor`: `#556b82`
- `--sapTile_IconColor`: `#556b82`
- `--sapTile_SeparatorColor`: `transparent`
- `--sapTile_Interactive_BorderColor`: `#b3b3b3`
- `--sapTile_OverlayBackground`: `#fff`
- `--sapTile_OverlayForegroundColor`: `#131e29`
- `--sapTile_Hover_ContentBackground`: `#fff`
- `--sapTile_Active_ContentBackground`: `#fff`

## Group (10)

- `--sapGroup_TitleBorderWidth`: `.0625rem`
- `--sapGroup_TitleBackground`: `#fff`
- `--sapGroup_TitleBorderColor`: `#a8b2bd`
- `--sapGroup_TitleTextColor`: `#131e29`
- `--sapGroup_Title_FontSize`: `1rem`
- `--sapGroup_ContentBackground`: `#fff`
- `--sapGroup_ContentBorderColor`: `#d9d9d9`
- `--sapGroup_BorderWidth`: `.0625rem`
- `--sapGroup_BorderCornerRadius`: `.75rem`
- `--sapGroup_FooterBackground`: `transparent`

## Link (9)

- `--sapLinkColor`: `#0064d9`
- `--sapLink_TextDecoration`: `none`
- `--sapLink_Hover_Color`: `#0064d9`
- `--sapLink_Hover_TextDecoration`: `underline`
- `--sapLink_Active_Color`: `#0064d9`
- `--sapLink_Active_TextDecoration`: `none`
- `--sapLink_Visited_Color`: `#0064d9`
- `--sapLink_InvertedColor`: `#a6cfff`
- `--sapLink_SubtleColor`: `#131e29`

## Element (8)

- `--sapElement_LineHeight`: `2.75rem`
- `--sapElement_Height`: `2.25rem`
- `--sapElement_BorderWidth`: `.0625rem`
- `--sapElement_BorderCornerRadius`: `.75rem`
- `--sapElement_Compact_LineHeight`: `2rem`
- `--sapElement_Compact_Height`: `1.625rem`
- `--sapElement_Condensed_LineHeight`: `1.5rem`
- `--sapElement_Condensed_Height`: `1.375rem`

## ObjectHeader (8)

- `--sapObjectHeader_Background`: `#fff`
- `--sapObjectHeader_Hover_Background`: `#eaecee`
- `--sapObjectHeader_BorderColor`: `#d9d9d9`
- `--sapObjectHeader_Title_TextColor`: `#131e29`
- `--sapObjectHeader_Title_FontSize`: `1.5rem`
- `--sapObjectHeader_Title_SnappedFontSize`: `1.25rem`
- `--sapObjectHeader_Title_FontFamily`: `"72Black", "72Blackfull","72", "72full", Arial, Helvetica, sans-serif`
- `--sapObjectHeader_Subtitle_TextColor`: `#556b82`

## Message (6)

- `--sapMessage_BorderWidth`: `.0625rem`
- `--sapMessage_ErrorBorderColor`: `#ff8ec4`
- `--sapMessage_WarningBorderColor`: `#ffe770`
- `--sapMessage_SuccessBorderColor`: `#cee67e`
- `--sapMessage_InformationBorderColor`: `#7bcfff`
- `--sapMessage_Button_Hover_Background`: `rgba(234,236,238,.2)`

## ScrollBar (6)

- `--sapScrollBar_FaceColor`: `#7b91a8`
- `--sapScrollBar_TrackColor`: `#fff`
- `--sapScrollBar_BorderColor`: `#7b91a8`
- `--sapScrollBar_SymbolColor`: `#0064d9`
- `--sapScrollBar_Dimension`: `.75rem`
- `--sapScrollBar_Hover_FaceColor`: `#5b728b`

## Neutral (5)

- `--sapNeutralColor`: `#788fa6`
- `--sapNeutralElementColor`: `#788fa6`
- `--sapNeutralTextColor`: `#131e29`
- `--sapNeutralBackground`: `#eff1f2`
- `--sapNeutralBorderColor`: `#788fa6`

## Infobar (5)

- `--sapInfobar_Background`: `#c2fcee`
- `--sapInfobar_Hover_Background`: `#fff`
- `--sapInfobar_Active_Background`: `#fff`
- `--sapInfobar_NonInteractive_Background`: `#f5f6f7`
- `--sapInfobar_TextColor`: `#046c7a`

## Background (4)

- `--sapBackgroundColor`: `#f5f6f7`
- `--sapBackgroundImage`: `none`
- `--sapBackgroundImageOpacity`: `1`
- `--sapBackgroundImageRepeat`: `false`
