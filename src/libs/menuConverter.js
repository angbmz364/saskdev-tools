import yaml from "js-yaml";

function parseActionsToZm(commands) {
    if (!commands) return [];
    let actions = [];
    let currentType = null;
    let currentList = [];

    let list = Array.isArray(commands) ? commands : [commands];

    const pushCurrent = () => {
        if (currentType && currentList.length > 0) {
            if (currentType === "console_command" || currentType === "player_command") {
                actions.push({ type: currentType, commands: [...currentList] });
            } else if (currentType === "message") {
                actions.push({ type: "message", messages: [...currentList] });
            }
            currentList = [];
        }
    };

    list.forEach((c) => {
        let cmd = String(c).trim();
        let parsedType, value;

        if (cmd.startsWith("[console]")) {
            parsedType = "console_command";
            value = cmd.substring(9).trim();
        } else if (cmd.startsWith("[player]")) {
            parsedType = "player_command";
            value = cmd.substring(8).trim();
        } else if (cmd.startsWith("[message]")) {
            parsedType = "message";
            value = cmd.substring(9).trim();
        } else if (cmd.startsWith("[close]")) {
            pushCurrent();
            actions.push({ type: "close" });
            currentType = null;
            return;
        } else if (cmd.startsWith("[openguimenu]")) {
            pushCurrent();
            actions.push({ type: "inventory", inventory: cmd.substring(13).trim() });
            currentType = null;
            return;
        } else {
            parsedType = "console_command";
            value = cmd; // default
        }

        if (currentType !== parsedType) {
            pushCurrent();
            currentType = parsedType;
        }
        currentList.push(value);
    });

    pushCurrent();
    return actions;
}

// Parse commands from zMenu back to DeluxeMenus
function parseActionsToDm(actions) {
    if (!actions) return [];
    let cmds = [];
    let list = Array.isArray(actions) ? actions : [actions];
    list.forEach((act) => {
        if (!act.type) return;
        let type = act.type.toLowerCase();
        if ((type === "console_command" || type === "console") && act.commands) {
            act.commands.forEach((c) => cmds.push("[console] " + c));
        } else if ((type === "player_command" || type === "player") && act.commands) {
            act.commands.forEach((c) => cmds.push("[player] " + c));
        } else if (type === "message" && act.messages) {
            act.messages.forEach((m) => cmds.push("[message] " + m));
        } else if (type === "close" || type === "close_inventory") {
            cmds.push("[close]");
        } else if ((type === "inventory" || type === "open_inventory") && act.inventory) {
            cmds.push("[openguimenu] " + act.inventory);
        }
    });
    return cmds;
}

export const convertDMtoZM = (sourceCode) => {
    const dx = yaml.load(sourceCode);
    if (!dx || typeof dx !== "object") throw new Error("Invalid YAML structure.");

    let zm = {
        name: dx.menu_title || "Menu Convertido",
        size: dx.size || 54,
        items: {},
    };

    if (dx.inventory_type) zm.type = dx.inventory_type;

    if (dx.items) {
        for (const [key, item] of Object.entries(dx.items)) {
            let zItem = { item: {} };

            // Materials
            if (item.material) {
                if (item.material.startsWith("basehead-")) {
                    zItem.item.material = "PLAYER_HEAD";
                    zItem.item.skull = item.material.split("-")[1];
                } else if (item.material.startsWith("head-")) {
                    zItem.item.material = "PLAYER_HEAD";
                    zItem.item.skull = item.material.split("-")[1];
                } else {
                    zItem.item.material = item.material;
                }
            } else {
                zItem.item.material = "STONE";
            }

            if (item.data !== undefined) zItem.item.data = item.data;
            if (item.amount !== undefined) zItem.item.amount = item.amount;

            // Slots
            if (item.slot !== undefined) zItem.slot = item.slot;
            if (item.slots) zItem.slots = item.slots;

            // Name & Lore
            if (item.display_name) zItem.item.name = item.display_name;
            if (item.lore) zItem.item.lore = item.lore;

            // View Requirement
            if (item.view_requirement && item.view_requirement.requirements) {
                let zReqs = [];
                for (const rVal of Object.values(item.view_requirement.requirements)) {
                    let reqType = String(rVal.type || "").toLowerCase();
                    if (reqType === "has permission") reqType = "permission";
                    let zR = { type: reqType };
                    for (let [k, v] of Object.entries(rVal)) {
                        if (k === "type") continue;
                        zR[k] = v;
                    }
                    zReqs.push(zR);
                }
                if (zReqs.length > 0) {
                    zItem["view-requirement"] = { requirements: zReqs };
                }
            }

            // Click Actions
            if (item.left_click_commands && !item.right_click_commands) {
                zItem.actions = parseActionsToZm(item.left_click_commands);
            } else if (!item.left_click_commands && item.right_click_commands) {
                zItem.actions = parseActionsToZm(item.right_click_commands);
            } else if (item.left_click_commands && item.right_click_commands) {
                if (JSON.stringify(item.left_click_commands) === JSON.stringify(item.right_click_commands)) {
                    zItem.actions = parseActionsToZm(item.left_click_commands);
                } else {
                    zItem.click_requirement = {
                        left_click: {
                            clicks: ["LEFT", "SHIFT_LEFT"],
                            actions: parseActionsToZm(item.left_click_commands),
                        },
                        right_click: {
                            clicks: ["RIGHT", "SHIFT_RIGHT"],
                            actions: parseActionsToZm(item.right_click_commands),
                        },
                    };
                }
            }

            zm.items[key] = zItem;
        }
    }

    return yaml.dump(zm, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: true });
};


export const convertZMtoDM = (sourceCode) => {
    const zm = yaml.load(sourceCode);
    if (!zm || typeof zm !== "object") throw new Error("Invalid YAML structure.");

    let dx = {
        menu_title: zm.name || "Menu Convertido",
        open_command: "menu",
        size: zm.size || 54,
        items: {},
    };
    if (zm.type) dx.inventory_type = zm.type;

    if (zm.items) {
        for (const [key, val] of Object.entries(zm.items)) {
            let dItem = {};

            if (val.item) {
                if (val.item.skull) {
                    dItem.material = "basehead-" + val.item.skull;
                } else {
                    dItem.material = val.item.material || "STONE";
                }
                if (val.item.amount) dItem.amount = val.item.amount;
                if (val.item.data) dItem.data = val.item.data;

                if (val.item.name) dItem.display_name = val.item.name;
                if (val.item.lore) dItem.lore = val.item.lore;
            } else {
                dItem.material = "STONE";
            }

            if (!dItem.display_name && val.name) dItem.display_name = val.name;
            if (!dItem.lore && val.lore) dItem.lore = val.lore;

            if (val.slot !== undefined) dItem.slot = val.slot;
            if (val.slots) dItem.slots = val.slots;

            // View Requirement
            let viewReq = val["view-requirement"] || val.view_requirement;
            if (viewReq && viewReq.requirements) {
                let dReqs = {};
                let reqList = Array.isArray(viewReq.requirements) ? viewReq.requirements : [];
                reqList.forEach((req, idx) => {
                    let rType = String(req.type || "").toLowerCase();
                    if (rType === "permission") rType = "has permission";
                    let dR = { type: rType };
                    for (let [k, v] of Object.entries(req)) {
                        if (k === "type") continue;
                        dR[k] = v;
                    }
                    dReqs["req" + (idx + 1)] = dR;
                });
                if (Object.keys(dReqs).length > 0) {
                    dItem.view_requirement = { requirements: dReqs };
                }
            }

            // Click Actions
            if (val.actions) {
                let dmCommands = parseActionsToDm(val.actions);
                dItem.left_click_commands = dmCommands;
                dItem.right_click_commands = dmCommands;
            } else if (val.click_requirement) {
                if (val.click_requirement.left_click && val.click_requirement.left_click.actions) {
                    dItem.left_click_commands = parseActionsToDm(val.click_requirement.left_click.actions);
                } else if (val.click_requirement.left_click) {
                    dItem.left_click_commands = parseActionsToDm(val.click_requirement.left_click);
                }

                if (val.click_requirement.right_click && val.click_requirement.right_click.actions) {
                    dItem.right_click_commands = parseActionsToDm(val.click_requirement.right_click.actions);
                } else if (val.click_requirement.right_click) {
                    dItem.right_click_commands = parseActionsToDm(val.click_requirement.right_click);
                }
            }

            // Legacy success conversion logic
            if (val.success && !dItem.left_click_commands) {
                let dmCommands = parseActionsToDm(val.success);
                dItem.left_click_commands = dmCommands;
                dItem.right_click_commands = dmCommands;
            }

            dx.items[key] = dItem;
        }
    }

    return yaml.dump(dx, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: true });
};
