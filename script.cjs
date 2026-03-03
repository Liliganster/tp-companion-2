const fs = require('fs');
let s = fs.readFileSync('src/components/settings/SettingsModal.tsx', 'utf-8');

const before = `                    <div className="glass-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{t("settings.apisOpenRouterTitle")}</h3>
                          <p className="text-sm text-muted-foreground">{t("settings.apisOpenRouterBody")}</p>
                        </div>
                        <Switch 
                          className="data-[state=checked]:bg-green-500 data-[state=checked]:hover:bg-green-500/90"
                          checked={profileData.openrouterEnabled}
                          onCheckedChange={(checked) => setProfileData({ ...profileData, openrouterEnabled: checked })}
                        />
                      </div>`;

const after = `                    <div className="glass-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium flex items-center gap-2">{t("settings.apisOpenRouterTitle")} {planTier !== "pro" && <Lock className="w-4 h-4 text-muted-foreground" /> }</h3>
                          <p className="text-sm text-muted-foreground">
                            {planTier !== "pro" ? t("odometer.proOnlyBody") : t("settings.apisOpenRouterBody")}
                          </p>
                        </div>
                        <Switch 
                          disabled={planTier !== "pro"}
                          className="data-[state=checked]:bg-green-500 data-[state=checked]:hover:bg-green-500/90"
                          checked={planTier === "pro" ? profileData.openrouterEnabled : false}
                          onCheckedChange={(checked) => setProfileData({ ...profileData, openrouterEnabled: checked })}
                        />
                      </div>`;

s = s.replace(before, after);
fs.writeFileSync('src/components/settings/SettingsModal.tsx', s);
