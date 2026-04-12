#define M2C 1
#define PLATFORM_GBA 1
#define size_t int

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef signed char s8;
typedef signed short s16;
typedef signed int s32;
typedef volatile u8 vu8;
typedef volatile u16 vu16;
typedef volatile u32 vu32;
typedef volatile s8 vs8;
typedef volatile s16 vs16;
typedef volatile s32 vs32;
#define TRUE 1
#define FALSE 0
#define NULL 0

#define EWRAM 0x02000000
#define IWRAM 0x03000000
#define IO_REG 0x04000000
#define PAL_RAM 0x05000000
#define BG_PAL_RAM 0x05000000
#define OBJ_PAL_RAM 0x05000200
#define VRAM 0x06000000
#define OAM 0x07000000
#define ROM 0x08000000
#define REG_DISPCNT (*(vu16 *)0x04000000)
#define REG_DISPSTAT (*(vu16 *)0x04000004)
#define REG_VCOUNT (*(vu16 *)0x04000006)
#define REG_BG0CNT (*(vu16 *)0x04000008)
#define REG_BG1CNT (*(vu16 *)0x0400000A)
#define REG_BG2CNT (*(vu16 *)0x0400000C)
#define REG_BG3CNT (*(vu16 *)0x0400000E)
#define REG_BG0HOFS (*(vu16 *)0x04000010)
#define REG_BG0VOFS (*(vu16 *)0x04000012)
#define REG_BG1HOFS (*(vu16 *)0x04000014)
#define REG_BG1VOFS (*(vu16 *)0x04000016)
#define REG_BG2HOFS (*(vu16 *)0x04000018)
#define REG_BG2VOFS (*(vu16 *)0x0400001A)
#define REG_BG3HOFS (*(vu16 *)0x0400001C)
#define REG_BG3VOFS (*(vu16 *)0x0400001E)
#define REG_WIN0H (*(vu16 *)0x04000040)
#define REG_WIN1H (*(vu16 *)0x04000042)
#define REG_WIN0V (*(vu16 *)0x04000044)
#define REG_WIN1V (*(vu16 *)0x04000046)
#define REG_WININ (*(vu16 *)0x04000048)
#define REG_WINOUT (*(vu16 *)0x0400004A)
#define REG_BLDCNT (*(vu16 *)0x04000050)
#define REG_BLDALPHA (*(vu16 *)0x04000052)
#define REG_BLDY (*(vu16 *)0x04000054)
#define REG_SOUND1CNT_L (*(vu16 *)0x04000060)
#define REG_SOUND1CNT_H (*(vu16 *)0x04000062)
#define REG_SOUND1CNT_X (*(vu16 *)0x04000064)
#define REG_SOUND2CNT_L (*(vu16 *)0x04000068)
#define REG_SOUND2CNT_H (*(vu16 *)0x0400006C)
#define REG_SOUND3CNT_L (*(vu16 *)0x04000070)
#define REG_SOUND3CNT_H (*(vu16 *)0x04000072)
#define REG_SOUND3CNT_X (*(vu16 *)0x04000074)
#define REG_SOUND4CNT_L (*(vu16 *)0x04000078)
#define REG_SOUND4CNT_H (*(vu16 *)0x0400007C)
#define REG_SOUNDCNT_L (*(vu16 *)0x04000080)
#define REG_SOUNDCNT_H (*(vu16 *)0x04000082)
#define REG_SOUNDCNT_X (*(vu16 *)0x04000084)
#define REG_SOUNDBIAS (*(vu16 *)0x04000088)
#define REG_WAVE_RAM0 (*(vu32 *)0x04000090)
#define REG_WAVE_RAM1 (*(vu32 *)0x04000094)
#define REG_WAVE_RAM2 (*(vu32 *)0x04000098)
#define REG_WAVE_RAM3 (*(vu32 *)0x0400009C)
#define REG_FIFO_A (*(vu32 *)0x040000A0)
#define REG_FIFO_B (*(vu32 *)0x040000A4)
#define REG_DMA0SAD (*(vu32 *)0x040000B0)
#define REG_DMA0DAD (*(vu32 *)0x040000B4)
#define REG_DMA0CNT (*(vu32 *)0x040000B8)
#define REG_DMA1SAD (*(vu32 *)0x040000BC)
#define REG_DMA1DAD (*(vu32 *)0x040000C0)
#define REG_DMA1CNT (*(vu32 *)0x040000C4)
#define REG_DMA2SAD (*(vu32 *)0x040000C8)
#define REG_DMA2DAD (*(vu32 *)0x040000CC)
#define REG_DMA2CNT (*(vu32 *)0x040000D0)
#define REG_DMA3SAD (*(vu32 *)0x040000D4)
#define REG_DMA3DAD (*(vu32 *)0x040000D8)
#define REG_DMA3CNT (*(vu32 *)0x040000DC)
#define REG_TM0CNT_L (*(vu16 *)0x04000100)
#define REG_TM0CNT_H (*(vu16 *)0x04000102)
#define REG_TM1CNT_L (*(vu16 *)0x04000104)
#define REG_TM1CNT_H (*(vu16 *)0x04000106)
#define REG_TM2CNT_L (*(vu16 *)0x04000108)
#define REG_TM2CNT_H (*(vu16 *)0x0400010A)
#define REG_TM3CNT_L (*(vu16 *)0x0400010C)
#define REG_TM3CNT_H (*(vu16 *)0x0400010E)
#define REG_IE (*(vu16 *)0x04000200)
#define REG_IF (*(vu16 *)0x04000202)
#define REG_IME (*(vu16 *)0x04000208)
#define DISPSTAT_VBLANK_IRQ_ENABLE 0x0008
#define IE_VBLANK 0x0001
#define DMA_ENABLE 0x80000000
#define DMA_32BIT 0x04000000
#define DMA_FIXED_SOURCE 0x01000000

#define gStreamPtr (*(u8 **)0x03004D84)
#define gGfxBufferPtr (*(u32 *)0x030034A0)
#define gStreamColorOut (*(u16 *)0x03005420)
#define gStreamColorMirror (*(u16 *)0x030034AC)
#define gDecompBuffer (*(u32 *)0x030007D0)
#define gGfxStreamBuffer (*(u32 *)0x030007C8)
#define gBuffer_52A4 (*(u32 *)0x030052A4)
#define gBldyFadeLevel (*(u8 *)0x030007D8)
#define gSoundInfo (*(u32 *)0x0300081C)
#define gMPlayInfo_BGM (*(u32 *)0x030064D8)
#define gMPlayInfo_SE (*(u32 *)0x030064DC)
#define gSoundTablePtr (*(u32 *)0x03006450)
#define gSoundCmdTablePtr (*(u32 *)0x03006454)
#define gSoundEventBuffer ((u8 *)0x030054A0)
#define SAPPY_MAGIC 0x68736D53
#define gKeysPressed (*(u16 *)0x03004DA0)
#define gKeysPrevious (*(u16 *)0x030051E4)
#define gInputState (*(u16 *)0x03004668)
#define gInputPrevious (*(u16 *)0x0300362C)
#define gPauseFlag (*(u8 *)0x030034E4)
#define gFrameCounter (*(u8 *)0x03005498)
#define gSoundResetFlag (*(u8 *)0x03003420)
#define gIMEAcknowledge (*(u16 *)0x03007FF8)
#define gEntityArray ((u8 *)0x03002920)
extern u32 gOamBuffer0[];
extern u32 gOamBuffer1[];
extern u32 gOamBuffer6[];
#define gOamEntryPtr (*(u32 *)0x03000820)
#define gEntityWorkBuffer ((u8 *)0x03002910)
#define gEntityStatusTable ((u8 *)0x0300363C)
#define gCurrentEntityCtx (*(u32 *)0x03004670)
#define gEntitySourcePtr (*(u32 *)0x03004658)
#define gLevelDataPtr (*(u32 *)0x03005288)
#define gControlBlock ((u8 *)0x03004C20)
#define gControlFlags ((u8 *)0x03004C08)
#define gGameStateArray ((u8 *)0x03005220)
extern u8 gGameFlagsPtr[];
#define gGameFlags ((u8 *)0x03005400)
#define gAnimStateBuffer ((u8 *)0x03003590)
#define gGfxDecompCtrl (*(u32 *)0x030047FC)
#define gUIRenderState ((u8 *)0x030034B0)
#define gBGLayerState ((u8 *)0x03003430)
#define gDecompBufferCtrl ((u8 *)0x03004790)
#define gEntityPtr (*(u32 *)0x03004654)
#define gOamSourceTable ((u16 *)0x03004680)
#define gStatusTable ((u8 *)0x03000830)
#define gMixedState ((u8 *)0x03003510)
#define gVramWriteCursor (*(u32 *)0x030007DC)
#define gPaletteVramCursor (*(u32 *)0x03005490)
#define gCollisionMapPtr (*(u32 *)0x03005290)
#define gLevelBounds ((u16 *)0x03005468)
#define gLevelStatePtr (*(u32 *)0x030034A0)
#define gTilemapWorkBuffer ((u8 *)0x03004DB0)
#define gScreenBufferA ((u8 *)0x03000900)
#define gScreenBufferB ((u8 *)0x03001100)
#define gScreenBufferC ((u8 *)0x03001900)
#define gVBlankCallback (*(u32 *)0x030047C0)
extern u32 gVBlankCallbackArray[];
extern u32 gCallbackStateArray[];
#define gOamBuffer ((u8 *)0x03004800)
#define gSpriteSlotIndex (*(u16 *)0x0300466C)
#define gSpriteDrawCount (*(u16 *)0x030051DC)
#define gDisplayMode ((u8 *)0x03000810)
#define gTextScrollState (*(u32 *)0x030034DC)
#define gUIState ((u8 *)0x03004DA0)
#define gRenderFlags (*(u32 *)0x03005428)
#define gDisplayState2 ((u8 *)0x03003410)
#define gViewportState ((u8 *)0x03005284)
#define ROM_STATE_DISPATCH_TABLE 0x080D9150
#define ROM_SPRITE_SUBTABLE 0x0818B8A8
#define ROM_SPRITE_FRAME_TABLE 0x08078FC8
#define ROM_DISPLAY_CONFIG_TABLE 0x080D821C
#define ROM_OAM_TEMPLATE 0x080E2A7C
#define ROM_GFX_ASSET_TABLE 0x0818B7AC
#define ROM_TILESET_TABLE 0x0818B8E0
#define ROM_BG_TILE_TABLE 0x08189034
#define ROM_BG_TILEMAP_TABLE 0x081892BC
#define ROM_BG_PALETTE_TABLE 0x08188F5C
#define ROM_BG_LOOKUP_TABLE 0x08057ACC
#define ROM_BG_TILE_SUBTABLE 0x08189BCC
#define ROM_BG_TILEMAP_SUBTABLE 0x08189CCC
#define ROM_BG_WIDTH_TABLE 0x08051C76
#define ROM_BG_HEIGHT_TABLE 0x08051DBA
#define ROM_BG_TILECOUNT_TABLE 0x08051EFE
#define ROM_BG_STRIDE_TABLE 0x08052042
#define ROM_BG_CONTROL_FLAGS 0x08051BD4
#define ROM_BG_EXTRA_TILES_A 0x0818955C
#define ROM_BG_EXTRA_TILEMAPS_A 0x08189574
#define ROM_BG_OBJ_TILESET_TABLE 0x08189544
#define ROM_COLLISION_MAP_TABLE 0x0818B7AC
#define ROM_LEVEL_PARAM_TABLE 0x08189A24
#define ROM_LAYER_SCROLL_FLAGS 0x080576D4
#define ROM_LAYER_WIDTH_TABLE 0x08057714
#define ROM_LAYER_HEIGHT_TABLE 0x08057794
#define ROM_LAYER_VSCROLL_TABLE 0x08057814
#define ROM_LAYER_TILE_BPP 0x08057894
#define ROM_LAYER_CHARBLOCK_IDX 0x080578D4
#define ROM_LAYER_SCREENBLOCK 0x08057914
#define ROM_SCENE_TILESET_A 0x08366214
#define ROM_SCENE_TILESET_B 0x08367468
#define ROM_SCENE_TILES_CB0 0x082F4D3C
#define ROM_SCENE_TILES_CB1 0x082F518C
#define ROM_SCENE_TILES_CB2 0x082F5D0C
#define ROM_SCENE_TILES_CB3 0x082F7D64
#define ROM_SCENE_TILEMAP_DATA 0x082F5920
#define ROM_SCENE_PALETTE_A 0x08078F88
#define ROM_SCENE_PALETTE_B 0x08078FA8
#define ROM_SCENE_OBJ_TILES 0x082F4934
#define ROM_SCENE_SPRITE_TABLE 0x08116590
extern const u32 gLevelPaletteTable[];
#define ROM_LEVEL_PALETTE_TABLE 0x08189B4C
extern const u32 gStreamDataTable[];
#define ROM_STREAM_TABLE 0x08189AFC
#define ROM_WORLDMAP_TILES 0x082EA584
#define ROM_WORLDMAP_TILEMAP 0x082EA730
#define ROM_WORLDMAP_PALETTE 0x082EA7F0
struct MusicPlayer {
    u32 info;
    u32 track;
    u16 numTracks;
    u8 unk_A;
    u8 pad;
};
struct Song {
    u32 header;
    u16 ms;
    u16 pad;
};
extern const struct MusicPlayer gMPlayTable[];
#define ROM_MUSIC_TABLE 0x08118AB4
extern const struct Song gSongTable[];
#define ROM_MUSIC_META_TABLE 0x08118AE4
extern const u32 gSoundCmdTable[];
#define ROM_SOUND_CMD_TABLE 0x08117C8C
#define ROM_INSTRUMENT_TABLE 0x081179E4
#define ROM_FREQ_TABLE_1 0x08117A74
#define ROM_FREQ_TABLE_2 0x08117B28
#define ROM_PITCH_TABLE 0x08117B70
#define ROM_WAVE_DUTY_TABLE 0x08117BF4
#define ROM_NOISE_TABLE 0x08117C0C
#define ROM_ENVELOPE_TABLE 0x08117C48
#define ROM_SWEEP_TABLE 0x08117C58
#define ROM_SOUND_INIT_DATA 0x081177E4
extern const u8 gEntityDataTable[];
#define ROM_ENTITY_DATA_TABLE 0x081168E8

