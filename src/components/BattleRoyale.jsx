import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Avatar from './Avatar';
import TournamentNetwork from './TournamentNetwork';
import { formatPoints, formatDuration, formatDistance, sumPointsWithCap, getLocalDay, restoreOriginalPoints } from '../utils/dataProcessor';
import { useSettings } from '../context/SettingsContext';
import { useBonusGrants } from '../context/BonusGrantsContext';
import { ROTATIONS } from '../data/rotations';

const COLOR_A = '#3b82f6';
const COLOR_B = '#ef4444';


function avatarColorFromString(str) {
  const colors = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#f59e0b', '#ec4899', '#6366f1'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

function generateExportHTML(data, settings, selectedRotation, grants = []) {
  const cap = settings.dailyPointsCap?.enabled ? parseFloat(settings.dailyPointsCap.value) : 0;

  // Restore original points before embedding in the export so Battle Royale
  // rotation scores in the standalone page are not corrupted by bonus edits.
  const exportCheckIns = restoreOriginalPoints(data.check_ins, grants);

  let mostRecentDate = new Date(0);
  for (const ci of exportCheckIns) {
    const d = new Date(ci.occurred_at);
    if (d > mostRecentDate) mostRecentDate = d;
  }

  const exportedData = {
    challengeName: data.name,
    dataAsOf: mostRecentDate.toISOString(),
    dailyCapValue: cap,
    defaultRotation: selectedRotation,
    rotations: ROTATIONS,
    teams: data.teams.map(t => ({
      id: t.id,
      name: t.name,
      photoUrl: t.photo_url || null,
      memberIds: t.team_members.map(tm => tm.account_id),
    })),
    members: Object.fromEntries(
      data.members.map(m => [m.id, {
        id: m.id,
        fullName: m.full_name,
        photoUrl: m.profile_picture_url || null,
        initials: m.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        color: avatarColorFromString(m.full_name),
      }])
    ),
    checkIns: exportCheckIns.map(ci => ({
      id: ci.id,
      accountId: ci.account_id,
      occurredAt: ci.occurred_at,
      timezone: ci.timezone || null,
      points: ci.points || 0,
      title: ci.title || null,
      activityType: ci.check_in_activities?.[0]?.platform_activity || null,
    })),
  };

  const dataJSON = JSON.stringify(exportedData);

  // Script block uses string concatenation only — no nested template literals
  const scriptBody = `
const DATA = ${dataJSON};
const COLOR_A = '#3b82f6';
const COLOR_B = '#ef4444';

function getLocalDay(isoStr, timezone) {
  if (!timezone) return isoStr.slice(0, 10);
  try { return new Date(isoStr).toLocaleDateString('sv', { timeZone: timezone }); }
  catch(e) { return isoStr.slice(0, 10); }
}

function sumPointsWithCap(checkIns, capValue) {
  if (!capValue || capValue <= 0) return checkIns.reduce(function(s,ci){return s+(ci.points||0);},0);
  var byDay = {};
  checkIns.forEach(function(ci){ var d=getLocalDay(ci.occurredAt,ci.timezone); byDay[d]=(byDay[d]||0)+(ci.points||0); });
  var total=0;
  Object.values(byDay).forEach(function(v){total+=Math.min(capValue,v);});
  return total;
}

function fmt(n){ return Math.round(n*100)/100; }

function fmtDate(iso){
  return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function buildFeedHtml(members, sortBy) {
  // Waterfall cap: within each member+day group, process chronologically, first-come first-served on budget
  var cappedMap = {};
  if (DATA.dailyCapValue > 0) {
    members.forEach(function(m) {
      var byDay = {};
      m.items.forEach(function(ci) {
        var day = getLocalDay(ci.occurredAt, ci.timezone);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(ci);
      });
      Object.values(byDay).forEach(function(dayCis) {
        var rawTotal = dayCis.reduce(function(s, ci) { return s + (ci.points || 0); }, 0);
        if (rawTotal <= DATA.dailyCapValue) return;
        dayCis.sort(function(a,b){ return new Date(a.occurredAt)-new Date(b.occurredAt); });
        var remaining = DATA.dailyCapValue;
        dayCis.forEach(function(ci) {
          var pts = ci.points || 0;
          var counted = Math.min(remaining, pts);
          remaining = Math.max(0, remaining - pts);
          if (counted < pts) cappedMap[ci.id] = { originalPts: pts, cappedPts: counted };
        });
      });
    });
  }

  var allCis = [];
  members.forEach(function(m){ allCis = allCis.concat(m.items); });
  if (!allCis.length) return '<div style="color:#64748b;font-style:italic;font-size:12px;">No activities this rotation</div>';

  // Group by local day
  var byDay = {};
  allCis.forEach(function(ci) {
    var day = getLocalDay(ci.occurredAt, ci.timezone);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(ci);
  });
  var daysSorted = Object.keys(byDay).sort(function(a,b){ return b.localeCompare(a); });
  if (sortBy === 'points') {
    daysSorted = daysSorted.slice().sort(function(a,b) {
      var sA = byDay[a].reduce(function(s,ci){return s+(ci.points||0);},0);
      var sB = byDay[b].reduce(function(s,ci){return s+(ci.points||0);},0);
      return sB - sA;
    });
  }

  return daysSorted.map(function(day) {
    var dayCis = byDay[day].slice().sort(function(a,b){ return new Date(a.occurredAt)-new Date(b.occurredAt); });
    var dayRaw = dayCis.reduce(function(s,ci){return s+(ci.points||0);},0);
    // Day header totals: sum per-player capped values (cap is per player, not per team)
    var byPlayer = {};
    dayCis.forEach(function(ci) {
      if (!byPlayer[ci.accountId]) byPlayer[ci.accountId] = [];
      byPlayer[ci.accountId].push(ci);
    });
    var dayCounted = 0;
    var anyPlayerCapped = false;
    Object.values(byPlayer).forEach(function(playerCis) {
      var playerRaw = playerCis.reduce(function(s,ci){return s+(ci.points||0);},0);
      dayCounted += DATA.dailyCapValue > 0 ? Math.min(DATA.dailyCapValue, playerRaw) : playerRaw;
      if (DATA.dailyCapValue > 0 && playerRaw > DATA.dailyCapValue) anyPlayerCapped = true;
    });
    var isDayCapped = anyPlayerCapped;
    var dayLabel = new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric'});
    var dayHeaderHtml = '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 4px;border-top:1px solid #334155;margin-top:4px;">'
      +'<span style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">'+dayLabel+'</span>'
      +'<div style="display:flex;align-items:center;gap:6px;">'
      +(isDayCapped?'<span style="font-size:11px;color:#64748b;text-decoration:line-through;">'+fmt(dayRaw)+'</span>':'')
      +'<span style="font-size:11px;font-weight:700;color:'+(isDayCapped?'#f97316':'#64748b')+';">'+fmt(dayCounted)+' pts</span>'
      +(isDayCapped?'<span style="font-size:10px;background:rgba(249,115,22,0.15);color:#f97316;padding:1px 5px;border-radius:4px;font-weight:600;">capped</span>':'')
      +'</div>'
      +'</div>';
    var activitiesHtml = dayCis.map(function(ci) {
      var pts = ci.points||0;
      var capInfo = cappedMap[ci.id];
      var m = DATA.members[ci.accountId] || {};
      var avatarHtml = m.photoUrl
        ? '<img src="'+m.photoUrl+'" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;" />'
        : '<div style="width:22px;height:22px;border-radius:50%;background:'+m.color+';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:white;flex-shrink:0;">'+m.initials+'</div>';
      var ptsHtml;
      if (capInfo) {
        var countedColor = capInfo.cappedPts === 0 ? '#64748b' : '#f97316';
        ptsHtml = '<span style="text-decoration:line-through;color:#64748b;margin-right:4px;">'+fmt(capInfo.originalPts)+'</span>'
                 +'<span style="color:'+countedColor+';font-weight:bold;">'+fmt(capInfo.cappedPts)+'</span>';
      } else {
        ptsHtml = '<span style="color:#f97316;font-weight:bold;">'+fmt(pts)+'</span>';
      }
      return '<div style="padding:6px 0;border-bottom:1px solid #1e293b;">'
        +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">'
        +avatarHtml
        +'<span style="font-size:13px;color:#cbd5e1;font-weight:500;">'+m.fullName+'</span>'
        +'</div>'
        +'<div style="font-size:11px;color:#94a3b8;">'+(ci.title||ci.activityType||'Workout')+'</div>'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">'
        +'<span style="font-size:10px;color:#64748b;">'+fmtDate(ci.occurredAt)+'</span>'
        +ptsHtml
        +'</div>'
        +'</div>';
    }).join('');
    return dayHeaderHtml + activitiesHtml;
  }).join('');
}

function buildMemberSummaryHtml(members, color, isWinnerTeam) {
  var maxPts = 1;
  members.forEach(function(m){ if(m.points>maxPts) maxPts=m.points; });
  return members.map(function(m) {
    var info = DATA.members[m.id] || {};
    var barW = maxPts > 0 ? Math.round((m.points/maxPts)*100) : 0;
    var avatarHtml = info.photoUrl
      ? '<img src="'+info.photoUrl+'" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;" />'
      : '<div style="width:28px;height:28px;border-radius:50%;background:'+info.color+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;flex-shrink:0;">'+info.initials+'</div>';
    var hasActivity = m.items.length > 0;
    var rewardHtml = isWinnerTeam
      ? (hasActivity ? '<span style="color:#10b981;font-size:11px;font-weight:bold;">&#11088; +10</span>' : '<span style="color:#64748b;font-size:11px;font-style:italic;">Not rewarded</span>')
      : '<span style="color:#64748b;font-size:11px;font-style:italic;">Not rewarded</span>';
    return '<div style="padding:8px 0;border-bottom:1px solid #1e293b;">'
      +'<div style="display:flex;align-items:center;gap:10px;">'
      +avatarHtml
      +'<div style="flex:1;min-width:0;">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:3px;">'
          +'<span style="font-size:13px;color:#e2e8f0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+info.fullName+'</span>'
          +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
            +rewardHtml
            +'<span style="font-size:13px;font-weight:700;color:'+color+';">'+fmt(m.points)+'</span>'
          +'</div>'
        +'</div>'
        +'<div style="height:3px;background:#0f172a;border-radius:4px;overflow:hidden;margin-bottom:3px;">'
          +'<div style="height:100%;width:'+barW+'%;background:'+color+';border-radius:4px;"></div>'
        +'</div>'
        +'<span style="font-size:10px;color:#64748b;">'+m.items.length+' workout'+(m.items.length!==1?'s':'')+'</span>'
      +'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

function render() {
  var rotNum = parseInt(document.getElementById('rotation-select').value)||DATA.defaultRotation;
  var teamAId = parseInt(document.getElementById('team-a-select').value)||0;
  var teamBId = parseInt(document.getElementById('team-b-select').value)||0;
  var sortSelectEl = document.getElementById('sort-select');
  var sortBy = sortSelectEl ? sortSelectEl.value : 'time';
  var resultsEl = document.getElementById('results');

  var rotation = DATA.rotations.find(function(r){return r.num===rotNum;});
  if (rotation) {
    var rdEl = document.getElementById('rotation-dates');
    if (rdEl) {
      var rStart = new Date(rotation.start).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      var rEnd = new Date(rotation.end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      rdEl.textContent = rStart + ' – ' + rEnd;
    }
  }

  if (!teamAId || !teamBId || teamAId === teamBId) {
    resultsEl.innerHTML = '<div style="padding:32px;text-align:center;color:#64748b;">Select two different teams to begin</div>';
    return;
  }

  var teamA = DATA.teams.find(function(t){return t.id===teamAId;});
  var teamB = DATA.teams.find(function(t){return t.id===teamBId;});
  if (!rotation||!teamA||!teamB) return;

  var startMs = new Date(rotation.start).getTime();
  var endMs = new Date(rotation.end).getTime();

  var periodCis = DATA.checkIns.filter(function(ci){
    var t = new Date(ci.occurredAt).getTime();
    return t>=startMs && t<=endMs;
  });

  function buildMembers(memberIds) {
    var stats = {};
    memberIds.forEach(function(id){ stats[id]={id:id,points:0,items:[]}; });
    periodCis.forEach(function(ci){
      if (stats[ci.accountId]) stats[ci.accountId].items.push(ci);
    });
    memberIds.forEach(function(id){ stats[id].points=sumPointsWithCap(stats[id].items,DATA.dailyCapValue); });
    return Object.values(stats).sort(function(a,b){return b.points-a.points;});
  }

  var teamAMembers = buildMembers(teamA.memberIds);
  var teamBMembers = buildMembers(teamB.memberIds);
  var ptsA = teamAMembers.reduce(function(s,m){return s+m.points;},0);
  var ptsB = teamBMembers.reduce(function(s,m){return s+m.points;},0);
  var winner = ptsA>ptsB?'A':ptsB>ptsA?'B':'draw';
  var isInProgress = new Date() < new Date(rotation.end);
  var bonusA = (!isInProgress && winner==='A') ? teamAMembers.filter(function(m){return m.items.length>0;}).length*10 : 0;
  var bonusB = (!isInProgress && winner==='B') ? teamBMembers.filter(function(m){return m.items.length>0;}).length*10 : 0;

  var winnerBadgeA = (!isInProgress && winner==='A')?'<div style="margin-top:8px;display:inline-block;background:rgba(59,130,246,0.2);color:#60a5fa;padding:6px 14px;border-radius:8px;font-weight:bold;">🏆 WINNER</div><div style="margin-top:6px;font-size:12px;color:#94a3b8;">+'+bonusA+' bonus pts</div>':'';
  var winnerBadgeB = (!isInProgress && winner==='B')?'<div style="margin-top:8px;display:inline-block;background:rgba(239,68,68,0.2);color:#f87171;padding:6px 14px;border-radius:8px;font-weight:bold;">🏆 WINNER</div><div style="margin-top:6px;font-size:12px;color:#94a3b8;">+'+bonusB+' bonus pts</div>':'';

  var photoAHtml = teamA.photoUrl ? '<img src="'+teamA.photoUrl+'" style="width:60px;height:60px;border-radius:10px;object-fit:cover;margin-bottom:10px;" /><br>' : '';
  var photoBHtml = teamB.photoUrl ? '<img src="'+teamB.photoUrl+'" style="width:60px;height:60px;border-radius:10px;object-fit:cover;margin-bottom:10px;" /><br>' : '';

  resultsEl.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;background:#1e293b;border-radius:16px;padding:24px;margin-bottom:24px;">'
      +'<div style="text-align:center;background:linear-gradient(135deg,rgba(59,130,246,0.1),transparent);padding:16px;border-radius:12px;">'
        +photoAHtml
        +'<div style="font-size:18px;font-weight:bold;color:#e2e8f0;">'+teamA.name+'</div>'
        +'<div style="font-size:36px;font-weight:900;color:'+COLOR_A+';margin:12px 0;">'+fmt(ptsA)+'</div>'
        +winnerBadgeA
      +'</div>'
      +'<div style="display:flex;align-items:center;justify-content:center;padding:0 12px;">'
        +'<span style="font-size:24px;font-weight:900;color:#475569;">VS</span>'
      +'</div>'
      +'<div style="text-align:center;background:linear-gradient(225deg,rgba(239,68,68,0.1),transparent);padding:16px;border-radius:12px;">'
        +photoBHtml
        +'<div style="font-size:18px;font-weight:bold;color:#e2e8f0;">'+teamB.name+'</div>'
        +'<div style="font-size:36px;font-weight:900;color:'+COLOR_B+';margin:12px 0;">'+fmt(ptsB)+'</div>'
        +winnerBadgeB
      +'</div>'
    +'</div>'
    +(isInProgress?'<div style="text-align:center;padding:12px 16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:12px;color:#fbbf24;font-weight:600;font-size:14px;margin-bottom:24px;">🔄 Rotation in progress — results so far</div>':'')
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">'
      +'<div style="background:#1e293b;border-radius:16px;padding:16px;">'
        +'<div style="font-size:13px;font-weight:600;color:#e2e8f0;padding-bottom:10px;border-bottom:1px solid #334155;margin-bottom:10px;display:flex;align-items:center;gap:8px;">'
          +'<div style="width:10px;height:10px;border-radius:50%;background:'+COLOR_A+';flex-shrink:0;"></div>'+teamA.name+' — Contributions'
        +'</div>'
        +buildMemberSummaryHtml(teamAMembers,COLOR_A,!isInProgress&&winner==='A')
      +'</div>'
      +'<div style="background:#1e293b;border-radius:16px;padding:16px;">'
        +'<div style="font-size:13px;font-weight:600;color:#e2e8f0;padding-bottom:10px;border-bottom:1px solid #334155;margin-bottom:10px;display:flex;align-items:center;gap:8px;">'
          +'<div style="width:10px;height:10px;border-radius:50%;background:'+COLOR_B+';flex-shrink:0;"></div>'+teamB.name+' — Contributions'
        +'</div>'
        +buildMemberSummaryHtml(teamBMembers,COLOR_B,!isInProgress&&winner==='B')
      +'</div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin:20px 0;padding:10px 14px;background:#1e293b;border-radius:10px;">'
      +'<span style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;font-weight:500;">Sort activities by</span>'
      +'<select id="sort-select" style="background:#0f172a;color:#e2e8f0;border:1px solid #334155;padding:6px 10px;border-radius:8px;font-size:12px;width:auto;">'
        +'<option value="time">🕐 Time (most recent first)</option>'
        +'<option value="points">🏅 Points (highest first)</option>'
      +'</select>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">'
      +'<div style="background:#1e293b;border-radius:16px;padding:16px;">'
        +'<div style="font-size:13px;font-weight:600;color:#e2e8f0;padding-bottom:10px;border-bottom:1px solid #334155;margin-bottom:10px;display:flex;align-items:center;gap:8px;">'
          +'<div style="width:10px;height:10px;border-radius:50%;background:'+COLOR_A+';flex-shrink:0;"></div>'+teamA.name+' — Activities'
        +'</div>'
        +buildFeedHtml(teamAMembers,sortBy)
      +'</div>'
      +'<div style="background:#1e293b;border-radius:16px;padding:16px;">'
        +'<div style="font-size:13px;font-weight:600;color:#e2e8f0;padding-bottom:10px;border-bottom:1px solid #334155;margin-bottom:10px;display:flex;align-items:center;gap:8px;">'
          +'<div style="width:10px;height:10px;border-radius:50%;background:'+COLOR_B+';flex-shrink:0;"></div>'+teamB.name+' — Activities'
        +'</div>'
        +buildFeedHtml(teamBMembers,sortBy)
      +'</div>'
    +'</div>';
}

function teamScoreForRotation(team, periodCis) {
  // Cap applied per member, then summed — matches React app behaviour
  var byMember = {};
  team.memberIds.forEach(function(id){ byMember[id]=[]; });
  periodCis.forEach(function(ci){ if(byMember[ci.accountId]) byMember[ci.accountId].push(ci); });
  var total=0;
  Object.values(byMember).forEach(function(cis){ total+=sumPointsWithCap(cis,DATA.dailyCapValue); });
  return total;
}

function renderNetwork() {
  var rotNum = parseInt(document.getElementById('rotation-select').value)||DATA.defaultRotation;
  var rotation = DATA.rotations.find(function(r){return r.num===rotNum;});
  var el = document.getElementById('network');
  if (!rotation||!rotation.featuredTeam) { el.innerHTML=''; return; }

  var featuredTeamName = rotation.featuredTeam;
  var teams = DATA.teams.filter(function(t){return !t.name.toLowerCase().includes('reserve');});
  var featuredTeam = teams.find(function(t){return t.name.trim().toLowerCase().includes(featuredTeamName.toLowerCase());});
  if (!featuredTeam) { el.innerHTML=''; return; }

  var startMs=new Date(rotation.start).getTime(), endMs=new Date(rotation.end).getTime();
  var periodCis=DATA.checkIns.filter(function(ci){
    var t=new Date(ci.occurredAt).getTime(); return t>=startMs&&t<=endMs;
  });

  var featuredScore = teamScoreForRotation(featuredTeam, periodCis);
  var otherTeams = teams.filter(function(t){return t.id!==featuredTeam.id;});
  var matchups = otherTeams.map(function(team){
    var score=teamScoreForRotation(team,periodCis);
    return {team:team, score:score, win:featuredScore>score};
  });

  var now=new Date();
  var rotStart=new Date(rotation.start);
  var rotEnd=new Date(rotation.end);
  var isFuture=now<rotStart;
  var isInProgress=now>=rotStart&&now<rotEnd;
  var nextSun=new Date(rotEnd);
  nextSun.setDate(nextSun.getDate()+((7-nextSun.getDay())%7||7));
  var isGracePeriod=!isFuture&&!isInProgress&&now<nextSun;
  var isClosed=!isFuture&&!isInProgress&&!isGracePeriod;
  var graceDateLabel=nextSun.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  var startDateLabel=rotStart.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  var WIN_COLOR='#10b981', LOSS_COLOR='#ef4444', ONGOING_COLOR='#94a3b8';
  var W=800,H=600,cx=400,cy=300,orbR=220;

  function matchupColor(win){ return isInProgress ? ONGOING_COLOR : (win ? WIN_COLOR : LOSS_COLOR); }
  function matchupEmoji(win){ return isInProgress ? '⏳' : (win ? '🏆' : '❌'); }

  var positions=matchups.map(function(m,i){
    var angle=(i/matchups.length)*Math.PI*2 - Math.PI/2;
    return {m:m, x:cx+Math.cos(angle)*orbR, y:cy+Math.sin(angle)*orbR};
  });

  var linesHtml=positions.map(function(p){
    var color=matchupColor(p.m.win);
    var midX=(cx+p.x)/2, midY=(cy+p.y)/2;
    return '<line x1="'+cx+'" y1="'+cy+'" x2="'+p.x+'" y2="'+p.y+'" stroke="'+color+'" stroke-width="2.5" opacity="0.7"/>'
      +'<text x="'+midX+'" y="'+(midY+6)+'" text-anchor="middle" font-size="20">'+matchupEmoji(p.m.win)+'</text>';
  }).join('');

  var orbitsHtml=positions.map(function(p){
    var color=matchupColor(p.m.win);
    return '<circle cx="'+p.x+'" cy="'+p.y+'" r="52" fill="white" stroke="'+color+'" stroke-width="4"/>'
      +'<text x="'+p.x+'" y="'+(p.y-10)+'" text-anchor="middle" font-size="13" font-weight="700" fill="#111827">'+p.m.team.name+'</text>'
      +'<text x="'+p.x+'" y="'+(p.y+16)+'" text-anchor="middle" font-size="18" font-weight="900" fill="#111827">'+fmt(p.m.score)+'</text>';
  }).join('');

  var svgHtml='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;background:#0f172a;border-radius:12px;">'
    +linesHtml+orbitsHtml
    +'<circle cx="'+cx+'" cy="'+cy+'" r="72" fill="white" stroke="#e2e8f0" stroke-width="4"/>'
    +'<text x="'+cx+'" y="'+(cy-18)+'" text-anchor="middle" font-size="14" font-weight="700" fill="#111827">'+featuredTeam.name+'</text>'
    +'<text x="'+cx+'" y="'+(cy+14)+'" text-anchor="middle" font-size="28" font-weight="900" fill="#111827">'+fmt(featuredScore)+'</text>'
    +'<text x="'+cx+'" y="'+(cy+34)+'" text-anchor="middle" font-size="9" font-weight="600" fill="#64748b">FEATURED</text>'
    +'</svg>';

  var legendHtml = isInProgress
    ? '<div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:50%;background:'+ONGOING_COLOR+';"></div><span style="color:#94a3b8;font-size:13px;">⏳ Ongoing — final results pending</span></div>'
    : '<div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:50%;background:'+WIN_COLOR+';"></div><span style="color:#94a3b8;font-size:13px;">Featured team won</span></div>'
      +'<div style="display:flex;align-items:center;gap:8px;"><div style="width:12px;height:12px;border-radius:50%;background:'+LOSS_COLOR+';"></div><span style="color:#94a3b8;font-size:13px;">Featured team lost</span></div>';

  el.innerHTML='<div style="background:#1e293b;border-radius:16px;padding:24px;margin-bottom:24px;">'
    +'<h2 style="font-size:18px;font-weight:bold;color:white;margin-bottom:6px;">🏆 Battle Royale Network View — '+featuredTeam.name+'</h2>'
    +'<p style="font-size:12px;color:#64748b;margin-bottom:'+(isFuture||isInProgress||isGracePeriod?'10':'16')+'px;">Featured team this rotation vs all others</p>'
    +(isFuture?'<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(100,116,139,0.1);border:1px solid rgba(100,116,139,0.3);border-radius:8px;padding:6px 12px;color:#94a3b8;font-weight:600;font-size:12px;margin-bottom:16px;">🔒 This rotation has not started yet — check back on '+startDateLabel+'</div>':'')
    +(isInProgress?'<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:6px 12px;color:#fbbf24;font-weight:600;font-size:12px;margin-bottom:16px;">🔄 Rotation in progress — results so far</div>':'')
    +(isGracePeriod?'<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.3);border-radius:8px;padding:6px 12px;color:#7dd3fc;font-weight:600;font-size:12px;margin-bottom:16px;">⏰ Rotation ended — players can still submit past check-ins until '+graceDateLabel+'</div>':'')
    +(isClosed?'<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:6px 12px;color:#34d399;font-weight:600;font-size:12px;margin-bottom:16px;">✅ Rotation finished</div>':'')
    +svgHtml
    +'<div style="display:flex;justify-content:center;gap:32px;margin-top:16px;">'+legendHtml+'</div>'
    +'</div>';
}

function autoSelectFeaturedTeam() {
  var rotNum=parseInt(document.getElementById('rotation-select').value)||DATA.defaultRotation;
  var rotation=DATA.rotations.find(function(r){return r.num===rotNum;});
  if (!rotation||!rotation.featuredTeam) return;
  var featuredTeam=DATA.teams.find(function(t){return t.name.trim().toLowerCase().includes(rotation.featuredTeam.toLowerCase());});
  if (!featuredTeam) return;
  document.getElementById('team-a-select').value=featuredTeam.id;
}

document.getElementById('rotation-select').addEventListener('change',function(){
  autoSelectFeaturedTeam();
  renderNetwork();
  render();
  attachSortListener();
});
document.getElementById('team-a-select').addEventListener('change',function(){render();attachSortListener();});
document.getElementById('team-b-select').addEventListener('change',function(){render();attachSortListener();});

function attachSortListener(){var e=document.getElementById('sort-select');if(e)e.addEventListener('change',function(){render();attachSortListener();});}

var asOf=new Date(DATA.dataAsOf);
document.getElementById('updated-date').textContent=asOf.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

var autoRot=DATA.rotations.find(function(r){var now=new Date();return now>=new Date(r.start)&&now<=new Date(r.end);});
document.getElementById('rotation-select').value=autoRot?autoRot.num:DATA.defaultRotation;

autoSelectFeaturedTeam();
renderNetwork();
render();
attachSortListener();
`;

  const rotationOptions = exportedData.rotations
    .map(r => {
      const s = new Date(r.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const e = new Date(r.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `<option value="${r.num}">${r.label} — ${s} to ${e}</option>`;
    })
    .join('');
  const teamOptions = exportedData.teams
    .map(t => `<option value="${t.id}">${t.name}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${exportedData.challengeName} — Battle Royale</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
    .container { max-width:1100px; margin:0 auto; padding:24px; }
    header { border-bottom:1px solid #1e293b; padding-bottom:16px; margin-bottom:24px; }
    h1 { font-size:1.5rem; font-weight:bold; margin-bottom:4px; }
    .meta { font-size:0.8rem; color:#64748b; }
    .rotation-control { background:#1e293b; padding:16px; border-radius:12px; margin-bottom:12px; max-width:320px; }
    .team-controls { display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#1e293b; padding:16px; border-radius:12px; margin-bottom:12px; }
    label { display:block; font-size:11px; color:#94a3b8; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em; }
    select { width:100%; background:#0f172a; color:#e2e8f0; border:1px solid #334155; padding:8px 10px; border-radius:8px; font-size:13px; }
    #rotation-dates { font-size:11px; color:#64748b; margin-top:5px; }
  </style>
</head>
<body>
<div class="container">
  <header>
    <h1>${exportedData.challengeName} — Battle Royale</h1>
    <div class="meta">Last updated: <span id="updated-date"></span></div>
  </header>
  <div class="rotation-control">
    <label>Rotation</label>
    <select id="rotation-select">${rotationOptions}</select>
    <div id="rotation-dates"></div>
  </div>
  <div id="network"></div>
  <div class="team-controls">
    <div>
      <label>Team A</label>
      <select id="team-a-select"><option value="">Team A…</option>${teamOptions}</select>
    </div>
    <div>
      <label>Team B</label>
      <select id="team-b-select"><option value="">Team B…</option>${teamOptions}</select>
    </div>
  </div>
  <div id="results"><div style="padding:32px;text-align:center;color:#64748b;">Select two teams to begin</div></div>
</div>
<script>
${scriptBody}
</script>
</body>
</html>`;
}

function getCurrentRotationNum() {
  const now = new Date();
  for (const r of ROTATIONS) {
    if (now >= new Date(r.start) && now <= new Date(r.end)) return r.num;
  }
  // Before challenge: return 1. After challenge: return last.
  if (now < new Date(ROTATIONS[0].start)) return 1;
  return ROTATIONS[ROTATIONS.length - 1].num;
}

function RewardBadge({ rewarded }) {
  if (rewarded) {
    return (
      <span className="flex-shrink-0 inline-flex items-center gap-1 text-emerald-400 font-bold text-xs" title="Logged ≥1 workout this rotation — earns team +10 pts">
        ⭐ +10
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 text-gray-600 text-xs italic" title="No workouts logged this rotation">
      Not rewarded
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}


function RotationFeed({ teamAName, teamBName, teamAMembers, teamBMembers, memberMap, dailyCap }) {
  const cap = dailyCap?.enabled ? parseFloat(dailyCap.value) : 0;
  const [sortBy, setSortBy] = useState('time');

  const renderTeamFeed = (members) => {
    const allCheckIns = [];
    for (const member of members) {
      allCheckIns.push(...(member.checkInItems || []));
    }

    if (allCheckIns.length === 0) {
      return <div className="text-sm text-gray-600 italic">No activities this rotation</div>;
    }

    // Build waterfall capInfoMap (grouped by member+day, chronological order)
    const capInfoMap = {};
    if (cap > 0) {
      const byMemberDay = {};
      for (const ci of allCheckIns) {
        const day = getLocalDay(ci.occurred_at, ci.timezone);
        const key = `${ci.account_id}::${day}`;
        if (!byMemberDay[key]) byMemberDay[key] = [];
        byMemberDay[key].push(ci);
      }
      for (const dayCis of Object.values(byMemberDay)) {
        const raw = dayCis.reduce((s, ci) => s + (ci.points || 0), 0);
        if (raw <= cap) continue;
        dayCis.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
        let remaining = cap;
        for (const ci of dayCis) {
          const pts = ci.points || 0;
          const counted = Math.min(remaining, pts);
          remaining = Math.max(0, remaining - pts);
          if (counted < pts) capInfoMap[ci.id] = { originalPts: pts, countedPts: counted };
        }
      }
    }

    // Group by local day
    const byDay = {};
    for (const ci of allCheckIns) {
      const day = getLocalDay(ci.occurred_at, ci.timezone);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(ci);
    }
    let daysSorted = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
    if (sortBy === 'points') {
      daysSorted = [...daysSorted].sort((a, b) => {
        const sumA = byDay[a].reduce((s, ci) => s + (ci.points || 0), 0);
        const sumB = byDay[b].reduce((s, ci) => s + (ci.points || 0), 0);
        return sumB - sumA;
      });
    }

    return daysSorted.map(day => {
      const dayCis = [...byDay[day]].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
      const dayRaw = dayCis.reduce((s, ci) => s + (ci.points || 0), 0);
      // Day header totals: sum per-player capped values (cap is per player, not per team)
      const byPlayer = {};
      for (const ci of dayCis) {
        if (!byPlayer[ci.account_id]) byPlayer[ci.account_id] = [];
        byPlayer[ci.account_id].push(ci);
      }
      let dayCounted = 0;
      let anyPlayerCapped = false;
      for (const playerCis of Object.values(byPlayer)) {
        const playerRaw = playerCis.reduce((s, ci) => s + (ci.points || 0), 0);
        dayCounted += cap > 0 ? Math.min(cap, playerRaw) : playerRaw;
        if (cap > 0 && playerRaw > cap) anyPlayerCapped = true;
      }
      const isDayCapped = anyPlayerCapped;
      return (
        <div key={day} className="mb-1">
          <div className="flex items-center justify-between pt-2 pb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{formatDate(day)}</span>
            <div className="flex items-center gap-1.5">
              {isDayCapped && <span className="text-xs text-gray-600 line-through">{formatPoints(dayRaw)}</span>}
              <span className={`text-xs font-bold ${isDayCapped ? 'text-orange-400' : 'text-gray-500'}`}>{formatPoints(dayCounted)} pts</span>
              {isDayCapped && <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-semibold">capped</span>}
            </div>
          </div>
          {dayCis.map(ci => {
            const activity = ci.check_in_activities?.[0]?.platform_activity;
            const title = ci.title || activity || 'Workout';
            const pts = ci.points || 0;
            const capInfo = capInfoMap[ci.id];
            const member = memberMap[ci.account_id];
            return (
              <div key={ci.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-800/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Avatar url={member?.profile_picture_url} name={member?.full_name || '?'} size="xs" />
                    <span className="text-sm font-medium text-gray-200 truncate">{member?.full_name || 'Unknown'}</span>
                  </div>
                  <div className="text-xs text-gray-500">{title}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{formatDateTime(ci.occurred_at)}</div>
                </div>
                <div className="text-sm font-bold text-orange-400 flex-shrink-0">
                  {capInfo ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 line-through text-xs">{formatPoints(capInfo.originalPts)}</span>
                      <span className={capInfo.countedPts === 0 ? 'text-gray-600' : ''}>{formatPoints(capInfo.countedPts)}</span>
                    </div>
                  ) : formatPoints(pts)}
                </div>
              </div>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className="mt-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-sm font-semibold text-gray-200">{teamAName} — Contributions</span>
        </div>
        <div className="space-y-0">{renderTeamFeed(teamAMembers)}</div>
      </div>
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-sm font-semibold text-gray-200">{teamBName} — Contributions</span>
        </div>
        <div className="space-y-0">{renderTeamFeed(teamBMembers)}</div>
      </div>
    </div>
    <div className="flex items-center gap-2 my-4">
      <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Sort activities by</span>
      <div className="flex bg-gray-800 rounded-lg p-0.5">
        <button
          onClick={() => setSortBy('time')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${sortBy === 'time' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          🕐 Time
        </button>
        <button
          onClick={() => setSortBy('points')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${sortBy === 'points' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          🏅 Points
        </button>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-sm font-semibold text-gray-200">{teamAName} — Activities</span>
        </div>
        <div className="space-y-0">{renderTeamFeed(teamAMembers)}</div>
      </div>
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-sm font-semibold text-gray-200">{teamBName} — Activities</span>
        </div>
        <div className="space-y-0">{renderTeamFeed(teamBMembers)}</div>
      </div>
    </div>
    </div>
  );
}

function BattleTooltip({ active, payload, label, nameA, nameB }) {
  if (!active || !payload?.length) return null;
  const a = payload.find(p => p.name === nameA);
  const b = payload.find(p => p.name === nameB);
  const leading = (a?.value || 0) >= (b?.value || 0) ? nameA : nameB;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl text-xs">
      <p className="text-gray-400 mb-2">{formatDate(label)}</p>
      {[a, b].filter(Boolean).map((entry, i) => (
        <div key={i} className={`flex items-center justify-between gap-4 ${i > 0 ? 'mt-1' : ''}`}>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className={entry.name === leading ? 'text-white font-bold' : 'text-gray-400'}>
              {entry.name}
            </span>
          </div>
          <span className={entry.name === leading ? 'font-bold' : 'text-gray-400'}
            style={entry.name === leading ? { color: entry.color } : {}}>
            {formatPoints(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoreHero({ nameA, nameB, avatarA, avatarB, photoA, photoB, pointsA, pointsB, winner, startDate, endDate, subtitleA, subtitleB, onClickA, onClickB, bonusA, bonusB, isInProgress }) {
  const total = pointsA + pointsB || 1;
  const barA = (pointsA / total) * 100;
  const barB = 100 - barA;
  const diff = Math.abs(pointsA - pointsB);

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_1fr]">
        {/* Side A */}
        <div
          className={`p-6 flex flex-col items-center text-center ${onClickA ? 'cursor-pointer group/a' : ''}`}
          style={{ background: `linear-gradient(135deg, ${COLOR_A}15, transparent)` }}
          onClick={onClickA}
        >
          {photoA
            ? <img src={photoA} alt={nameA} className="w-20 h-20 rounded-2xl object-cover mb-3 ring-2 ring-blue-500/30" />
            : <div className="mb-3"><Avatar url={avatarA} name={nameA} size="xl" /></div>
          }
          <div className={`text-xl font-bold text-white ${onClickA ? 'group-hover/a:text-blue-300 transition-colors' : ''}`}>{nameA}</div>
          {subtitleA && <div className="text-xs text-gray-500 mt-1">{subtitleA}</div>}
          {onClickA && <div className="text-xs text-gray-600 mt-1 opacity-0 group-hover/a:opacity-100 transition-opacity">View profile →</div>}
          {!isInProgress && winner === 'A' && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 text-sm font-bold px-4 py-2 rounded-xl border border-blue-500/30 shadow-lg shadow-blue-500/10">
                🏆 WINNER
              </div>
              {bonusA > 0 && (
                <div className="text-sm font-semibold text-emerald-400">
                  +{bonusA} <span className="text-xs text-emerald-600">bonus pts</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* VS */}
        <div className="flex items-center justify-center px-4">
          <div className="text-center">
            <div className="text-2xl font-black text-gray-600">VS</div>
            <div className="text-xs text-gray-700 mt-1">{formatDate(startDate)} – {formatDate(endDate)}</div>
          </div>
        </div>

        {/* Side B */}
        <div
          className={`p-6 flex flex-col items-center text-center ${onClickB ? 'cursor-pointer group/b' : ''}`}
          style={{ background: `linear-gradient(225deg, ${COLOR_B}15, transparent)` }}
          onClick={onClickB}
        >
          {photoB
            ? <img src={photoB} alt={nameB} className="w-20 h-20 rounded-2xl object-cover mb-3 ring-2 ring-red-500/30" />
            : <div className="mb-3"><Avatar url={avatarB} name={nameB} size="xl" /></div>
          }
          <div className={`text-xl font-bold text-white ${onClickB ? 'group-hover/b:text-red-300 transition-colors' : ''}`}>{nameB}</div>
          {subtitleB && <div className="text-xs text-gray-500 mt-1">{subtitleB}</div>}
          {onClickB && <div className="text-xs text-gray-600 mt-1 opacity-0 group-hover/b:opacity-100 transition-opacity">View profile →</div>}
          {!isInProgress && winner === 'B' && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 bg-red-500/20 text-red-300 text-sm font-bold px-4 py-2 rounded-xl border border-red-500/30 shadow-lg shadow-red-500/10">
                🏆 WINNER
              </div>
              {bonusB > 0 && (
                <div className="text-sm font-semibold text-emerald-400">
                  +{bonusB} <span className="text-xs text-emerald-600">bonus pts</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Score bar */}
      <div className="px-6 pb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-3xl font-black" style={{ color: COLOR_A }}>{formatPoints(pointsA)}</span>
          {winner === 'draw'
            ? <span className="text-sm font-bold text-gray-400">DRAW</span>
            : <span className="text-xs text-gray-600">+{formatPoints(diff)} pts diff</span>
          }
          <span className="text-3xl font-black" style={{ color: COLOR_B }}>{formatPoints(pointsB)}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden">
          <div className="h-full transition-all duration-700" style={{ width: `${barA}%`, background: COLOR_A }} />
          <div className="h-full transition-all duration-700" style={{ width: `${barB}%`, background: COLOR_B }} />
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>{barA.toFixed(1)}%</span>
          <span>{barB.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function BattleChart({ timelineData, nameA, nameB }) {
  const interval = Math.max(0, Math.floor(timelineData.length / 7) - 1);
  return (
    <div className="bg-gray-900 rounded-2xl p-4 pt-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4 px-2">Cumulative Points — Battle Progress</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={timelineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={interval}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={v => v.toFixed(0)}
          />
          <Tooltip content={<BattleTooltip nameA={nameA} nameB={nameB} />} />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
            formatter={(value, entry) => <span style={{ color: entry.color }}>{value}</span>}
          />
          <Line type="monotone" dataKey={nameA} stroke={COLOR_A} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey={nameB} stroke={COLOR_B} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Team vs Team ────────────────────────────────────────────────────────────

function MemberRow({ member, points, checkIns, maxPoints, color, onPlayerClick, rewarded }) {
  const bar = maxPoints > 0 ? (points / maxPoints) * 100 : 0;
  const fullName = member?.full_name || 'Unknown';
  return (
    <div
      className="flex items-center gap-3 py-2 cursor-pointer group"
      onClick={() => member?.id && onPlayerClick?.(member.id)}
    >
      <Avatar url={member?.profile_picture_url} name={fullName} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm text-gray-200 group-hover:text-orange-300 transition-colors truncate">{fullName}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <RewardBadge rewarded={rewarded} />
            <span className="text-sm font-semibold" style={{ color }}>{formatPoints(points)}</span>
          </div>
        </div>
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${bar}%`, background: color }} />
        </div>
        <div className="text-xs text-gray-600 mt-0.5">{checkIns} workout{checkIns !== 1 ? 's' : ''}</div>
      </div>
    </div>
  );
}

function TeamVsTeam({ data, memberStats, onPlayerClick, rotationStart, rotationEnd, rotationActivityMap }) {
  const { settings } = useSettings();
  const { grants } = useBonusGrants();
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');

  if (data.teams.length === 0) {
    return (
      <div className="bg-gray-900 rounded-2xl p-10 text-center">
        <div className="text-4xl mb-3">👤</div>
        <h2 className="text-lg font-bold text-white">No teams in this challenge</h2>
        <p className="text-sm text-gray-500 mt-2">
          Switch to <span className="text-orange-400 font-semibold">🥊 Player vs Player</span> above to set up a matchup.
        </p>
      </div>
    );
  }

  const memberMap = useMemo(() => {
    const map = {};
    for (const m of data.members) map[m.id] = m;
    return map;
  }, [data.members]);

  const teamA = data.teams.find(t => t.id === parseInt(teamAId));
  const teamB = data.teams.find(t => t.id === parseInt(teamBId));
  const sameTeam = teamA && teamB && teamA.id === teamB.id;

  const result = useMemo(() => {
    if (!teamA || !teamB || !rotationStart || !rotationEnd || sameTeam) return null;
    const start = new Date(rotationStart);
    const end = new Date(rotationEnd);
    const teamAIds = new Set(teamA.team_members.map(tm => tm.account_id));
    const teamBIds = new Set(teamB.team_members.map(tm => tm.account_id));

    // Restore original points so bonus edits inside the rotation window
    // don't affect Team vs Team scores or the timeline chart.
    const restoredCheckIns = restoreOriginalPoints(data.check_ins, grants);
    const periodCheckIns = restoredCheckIns.filter(ci => {
      const d = new Date(ci.occurred_at);
      return d >= start && d <= end;
    });

    function buildMemberStats(memberIds) {
      const stats = {};
      for (const id of memberIds) {
        stats[id] = { member: memberStats[id]?.member, points: 0, checkInCount: 0, checkInItems: [] };
      }
      for (const ci of periodCheckIns) {
        if (memberIds.has(ci.account_id)) {
          stats[ci.account_id].checkInCount += 1;
          stats[ci.account_id].checkInItems.push(ci);
        }
      }
      // Apply daily cap per member
      for (const id of memberIds) {
        const memberCheckIns = periodCheckIns.filter(ci => ci.account_id === id);
        stats[id].points = sumPointsWithCap(memberCheckIns, settings.dailyPointsCap);
      }
      return Object.values(stats).sort((a, b) => b.points - a.points);
    }

    const teamAMembers = buildMemberStats(teamAIds);
    const teamBMembers = buildMemberStats(teamBIds);
    const teamAPoints = teamAMembers.reduce((s, m) => s + m.points, 0);
    const teamBPoints = teamBMembers.reduce((s, m) => s + m.points, 0);

    // Hourly cumulative timeline: for each hour, show running total with daily cap applied per member
    const hours = [];
    const hourCursor = new Date(start);
    while (hourCursor <= end) { hours.push(new Date(hourCursor)); hourCursor.setHours(hourCursor.getHours() + 1); }

    const timelineData = hours.map(hourEnd => {
      const aCisSoFar = periodCheckIns.filter(ci => teamAIds.has(ci.account_id) && new Date(ci.occurred_at) <= hourEnd);
      const bCisSoFar = periodCheckIns.filter(ci => teamBIds.has(ci.account_id) && new Date(ci.occurred_at) <= hourEnd);
      const byMemberA = {};
      for (const ci of aCisSoFar) { (byMemberA[ci.account_id] = byMemberA[ci.account_id] || []).push(ci); }
      const byMemberB = {};
      for (const ci of bCisSoFar) { (byMemberB[ci.account_id] = byMemberB[ci.account_id] || []).push(ci); }
      const ptsA = Object.values(byMemberA).reduce((s, cis) => s + sumPointsWithCap(cis, settings.dailyPointsCap), 0);
      const ptsB = Object.values(byMemberB).reduce((s, cis) => s + sumPointsWithCap(cis, settings.dailyPointsCap), 0);
      return { date: hourEnd.toISOString().slice(0, 16), [teamA.name]: parseFloat(ptsA.toFixed(2)), [teamB.name]: parseFloat(ptsB.toFixed(2)) };
    });

    const winner = teamAPoints > teamBPoints ? 'A' : teamBPoints > teamAPoints ? 'B' : 'draw';
    return { teamAPoints, teamBPoints, teamAMembers, teamBMembers, timelineData, winner, periodCheckIns };
  }, [teamA, teamB, rotationStart, rotationEnd, sameTeam, data.check_ins, memberStats, settings.dailyPointsCap, grants]);

  const maxA = result?.teamAMembers[0]?.points || 1;
  const maxB = result?.teamBMembers[0]?.points || 1;
  const startLabel = rotationStart ? formatDate(rotationStart.slice(0, 10)) : '';
  const endLabel = rotationEnd ? formatDate(rotationEnd.slice(0, 10)) : '';
  const isInProgress = rotationEnd ? new Date() < new Date(rotationEnd) : false;

  return (
    <>
      {/* Controls */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-xs text-blue-400 font-medium mb-1.5 uppercase tracking-wider">Team A</label>
            <select value={teamAId} onChange={e => setTeamAId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              <option value="">Select a team…</option>
              {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-red-400 font-medium mb-1.5 uppercase tracking-wider">Team B</label>
            <select value={teamBId} onChange={e => setTeamBId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500">
              <option value="">Select a team…</option>
              {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        {startLabel && endLabel && (
          <p className="text-xs text-gray-600 mt-3">{startLabel} – {endLabel}</p>
        )}
        {sameTeam && <p className="text-red-400 text-xs mt-3">Please select two different teams.</p>}
      </div>

      {!result && !sameTeam && (
        <div className="text-center py-16 text-gray-600">
          <div className="text-5xl mb-4">⚔️</div>
          <p className="text-lg font-medium text-gray-500">Select two teams to start the battle</p>
          <p className="text-sm mt-1">Choose Team A and Team B above</p>
        </div>
      )}

      {result && (
        <>
          {(() => {
            const bonusA = !isInProgress && result.winner === 'A' ? result.teamAMembers.filter(m => rotationActivityMap.has(m.member?.id)).length * 10 : 0;
            const bonusB = !isInProgress && result.winner === 'B' ? result.teamBMembers.filter(m => rotationActivityMap.has(m.member?.id)).length * 10 : 0;
            return (
              <>
                <ScoreHero
                  nameA={teamA.name} nameB={teamB.name}
                  photoA={teamA.photo_url} photoB={teamB.photo_url}
                  pointsA={result.teamAPoints} pointsB={result.teamBPoints}
                  winner={result.winner} startDate={rotationStart?.slice(0, 10)} endDate={rotationEnd?.slice(0, 10)}
                  subtitleA={`${result.teamAMembers.length} members`}
                  subtitleB={`${result.teamBMembers.length} members`}
                  bonusA={bonusA}
                  bonusB={bonusB}
                  isInProgress={isInProgress}
                />
                {isInProgress && (
                  <div className="flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 text-sm font-semibold">
                    🔄 Rotation in progress — results so far
                  </div>
                )}
              </>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-sm font-semibold text-gray-200">{teamA.name} — Contributions</span>
                <span className="ml-auto text-xs text-blue-400 font-bold">{formatPoints(result.teamAPoints)} pts</span>
              </div>
              <div className="divide-y divide-gray-800/50">
                {result.teamAMembers.map(m => (
                  <MemberRow key={m.member?.id} member={m.member} points={m.points} checkIns={m.checkInCount} maxPoints={maxA} color={COLOR_A} onPlayerClick={onPlayerClick} rewarded={!isInProgress && result.winner === 'A' && rotationActivityMap.has(m.member?.id)} />
                ))}
              </div>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-sm font-semibold text-gray-200">{teamB.name} — Contributions</span>
                <span className="ml-auto text-xs text-red-400 font-bold">{formatPoints(result.teamBPoints)} pts</span>
              </div>
              <div className="divide-y divide-gray-800/50">
                {result.teamBMembers.map(m => (
                  <MemberRow key={m.member?.id} member={m.member} points={m.points} checkIns={m.checkInCount} maxPoints={maxB} color={COLOR_B} onPlayerClick={onPlayerClick} rewarded={!isInProgress && result.winner === 'B' && rotationActivityMap.has(m.member?.id)} />
                ))}
              </div>
            </div>
          </div>

          <BattleChart timelineData={result.timelineData} nameA={teamA.name} nameB={teamB.name} />

          <RotationFeed
            teamAName={teamA.name}
            teamBName={teamB.name}
            teamAMembers={result.teamAMembers}
            teamBMembers={result.teamBMembers}
            memberMap={memberMap}
            dailyCap={settings.dailyPointsCap}
          />
        </>
      )}
    </>
  );
}

// ─── Player vs Player ─────────────────────────────────────────────────────────

function WorkoutRow({ checkIn, color, distanceUnit }) {
  const activity = checkIn.check_in_activities?.[0]?.platform_activity;
  const title = checkIn.title || activity || 'Workout';
  const pts = checkIn.points || 0;

  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-gray-200 truncate font-medium">{title}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{formatDateTime(checkIn.occurred_at)}</span>
          {activity && (
            <span className="text-xs text-gray-600 capitalize bg-gray-800 px-1.5 py-0.5 rounded">{activity}</span>
          )}
          {checkIn.duration_millis > 0 && (
            <span className="text-xs text-gray-600">{formatDuration(checkIn.duration_millis)}</span>
          )}
          {parseFloat(checkIn.distance_miles) > 0 && (
            <span className="text-xs text-gray-600">{formatDistance(checkIn.distance_miles, distanceUnit)}</span>
          )}
        </div>
      </div>
      <span className="text-sm font-bold flex-shrink-0" style={{ color }}>{formatPoints(pts)}</span>
    </div>
  );
}

function PlayerVsPlayer({ data, memberStats, onPlayerClick, rotationStart, rotationEnd, rotationActivityMap }) {
  const { settings } = useSettings();
  const { grants } = useBonusGrants();
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const startDate = rotationStart?.slice(0, 10) || '';
  const endDate = rotationEnd?.slice(0, 10) || '';

  const sortedMembers = useMemo(() =>
    [...data.members].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [data.members]
  );

  const playerA = data.members.find(m => m.id === parseInt(playerAId));
  const playerB = data.members.find(m => m.id === parseInt(playerBId));
  const samePlayer = playerA && playerB && playerA.id === playerB.id;

  const result = useMemo(() => {
    if (!playerA || !playerB || !startDate || !endDate || samePlayer) return null;
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    const restoredForPvP = restoreOriginalPoints(data.check_ins, grants);
    const periodCheckIns = restoredForPvP.filter(ci => {
      const d = new Date(ci.occurred_at);
      return d >= start && d <= end && (ci.account_id === playerA.id || ci.account_id === playerB.id);
    });

    const aCheckIns = periodCheckIns.filter(ci => ci.account_id === playerA.id)
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    const bCheckIns = periodCheckIns.filter(ci => ci.account_id === playerB.id)
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));

    const pointsA = sumPointsWithCap(aCheckIns, settings.dailyPointsCap);
    const pointsB = sumPointsWithCap(bCheckIns, settings.dailyPointsCap);

    // Hourly cumulative timeline: running total with daily cap applied per player
    const hours = [];
    const hourCursor = new Date(start);
    while (hourCursor <= end) { hours.push(new Date(hourCursor)); hourCursor.setHours(hourCursor.getHours() + 1); }

    const timelineData = hours.map(hourEnd => {
      const aCisSoFar = aCheckIns.filter(ci => new Date(ci.occurred_at) <= hourEnd);
      const bCisSoFar = bCheckIns.filter(ci => new Date(ci.occurred_at) <= hourEnd);
      const ptsA = sumPointsWithCap(aCisSoFar, settings.dailyPointsCap);
      const ptsB = sumPointsWithCap(bCisSoFar, settings.dailyPointsCap);
      return { date: hourEnd.toISOString().slice(0, 16), [playerA.full_name]: parseFloat(ptsA.toFixed(2)), [playerB.full_name]: parseFloat(ptsB.toFixed(2)) };
    });

    const winner = pointsA > pointsB ? 'A' : pointsB > pointsA ? 'B' : 'draw';
    return { pointsA, pointsB, aCheckIns, bCheckIns, timelineData, winner };
  }, [playerA, playerB, startDate, endDate, samePlayer, data.check_ins, settings.dailyPointsCap, grants]);

  const statsA = playerA ? memberStats[playerA.id] : null;
  const statsB = playerB ? memberStats[playerB.id] : null;

  return (
    <>
      {/* Controls */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-xs text-blue-400 font-medium mb-1.5 uppercase tracking-wider">Player A</label>
            <select value={playerAId} onChange={e => setPlayerAId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              <option value="">Select a player…</option>
              {sortedMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-red-400 font-medium mb-1.5 uppercase tracking-wider">Player B</label>
            <select value={playerBId} onChange={e => setPlayerBId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500">
              <option value="">Select a player…</option>
              {sortedMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>
        {startDate && endDate && (
          <p className="text-xs text-gray-600 mt-3">{formatDate(startDate)} – {formatDate(endDate)}</p>
        )}
        {samePlayer && <p className="text-red-400 text-xs mt-3">Please select two different players.</p>}
      </div>

      {!result && !samePlayer && (
        <div className="text-center py-16 text-gray-600">
          <div className="text-5xl mb-4">🥊</div>
          <p className="text-lg font-medium text-gray-500">Select two players to start the battle</p>
          <p className="text-sm mt-1">Choose Player A and Player B above, then set a date range</p>
        </div>
      )}

      {result && (
        <>
          <ScoreHero
            nameA={playerA.full_name} nameB={playerB.full_name}
            avatarA={playerA.profile_picture_url} avatarB={playerB.profile_picture_url}
            pointsA={result.pointsA} pointsB={result.pointsB}
            winner={result.winner} startDate={startDate} endDate={endDate}
            subtitleA={`${result.aCheckIns.length} workout${result.aCheckIns.length !== 1 ? 's' : ''}`}
            subtitleB={`${result.bCheckIns.length} workout${result.bCheckIns.length !== 1 ? 's' : ''}`}
            onClickA={onPlayerClick ? () => onPlayerClick(playerA.id) : undefined}
            onClickB={onPlayerClick ? () => onPlayerClick(playerB.id) : undefined}
          />

          {/* Workout logs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
                <Avatar url={playerA.profile_picture_url} name={playerA.full_name} size="xs" />
                <span className="text-sm font-semibold text-gray-200 truncate">{playerA.full_name}</span>
                <RewardBadge rewarded={rotationActivityMap.has(playerA.id)} />
                <span className="ml-auto text-xs text-blue-400 font-bold flex-shrink-0">{formatPoints(result.pointsA)} pts</span>
              </div>
              {result.aCheckIns.length === 0
                ? <p className="text-sm text-gray-600 py-4 text-center">No workouts in this period</p>
                : <div className="divide-y divide-gray-800/50 max-h-80 overflow-y-auto">
                    {result.aCheckIns.map(ci => <WorkoutRow key={ci.id} checkIn={ci} color={COLOR_A} distanceUnit={settings.distanceUnit} />)}
                  </div>
              }
            </div>
            <div className="bg-gray-900 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
                <Avatar url={playerB.profile_picture_url} name={playerB.full_name} size="xs" />
                <span className="text-sm font-semibold text-gray-200 truncate">{playerB.full_name}</span>
                <RewardBadge rewarded={rotationActivityMap.has(playerB.id)} />
                <span className="ml-auto text-xs text-red-400 font-bold flex-shrink-0">{formatPoints(result.pointsB)} pts</span>
              </div>
              {result.bCheckIns.length === 0
                ? <p className="text-sm text-gray-600 py-4 text-center">No workouts in this period</p>
                : <div className="divide-y divide-gray-800/50 max-h-80 overflow-y-auto">
                    {result.bCheckIns.map(ci => <WorkoutRow key={ci.id} checkIn={ci} color={COLOR_B} distanceUnit={settings.distanceUnit} />)}
                  </div>
              }
            </div>
          </div>

          <BattleChart timelineData={result.timelineData} nameA={playerA.full_name} nameB={playerB.full_name} />
        </>
      )}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function BattleRoyale({ data, memberStats, onPlayerClick }) {
  const { settings } = useSettings();
  const { grants } = useBonusGrants();
  const hasTeams = data.teams.length > 0;
  const [mode, setMode] = useState(hasTeams ? 'team' : 'player');

  const initFilterMode = () => {
    const now = new Date();
    const currentRotation = ROTATIONS.find(r => now >= new Date(r.start) && now <= new Date(r.end));
    return currentRotation ? 'rotation' : 'custom';
  };

  const initSelectedRotation = () => {
    const now = new Date();
    const currentRotation = ROTATIONS.find(r => now >= new Date(r.start) && now <= new Date(r.end));
    return currentRotation ? currentRotation.num : 1;
  };

  const initCustomDates = () => {
    const now = new Date();
    const currentRotation = ROTATIONS.find(r => now >= new Date(r.start) && now <= new Date(r.end));
    if (currentRotation) return { start: '', end: '' };
    const challengeStart = data.start_date?.slice(0, 10) || '';
    const challengeEnd = data.end_date?.slice(0, 10) || '';
    return { start: challengeStart, end: challengeEnd };
  };

  const [filterMode, setFilterMode] = useState(initFilterMode());
  const [selectedRotation, setSelectedRotation] = useState(initSelectedRotation());
  const initialDates = initCustomDates();
  const [customStart, setCustomStart] = useState(initialDates.start);
  const [customEnd, setCustomEnd] = useState(initialDates.end);

  const rotation = ROTATIONS.find(r => r.num === selectedRotation) ?? ROTATIONS[0];

  const activeStart = filterMode === 'rotation' ? rotation.start : (customStart ? customStart + 'T00:00:00' : '');
  const activeEnd = filterMode === 'rotation' ? rotation.end : (customEnd ? customEnd + 'T23:59:59' : '');

  const rotationActivityMap = useMemo(() => {
    if (!activeStart || !activeEnd) return new Map();
    const startMs = new Date(activeStart).getTime();
    const endMs = new Date(activeEnd).getTime();
    const map = new Map();
    for (const ci of data.check_ins) {
      const t = new Date(ci.occurred_at).getTime();
      if (t >= startMs && t <= endMs) {
        if (!map.has(ci.account_id)) map.set(ci.account_id, 0);
        map.set(ci.account_id, map.get(ci.account_id) + 1);
      }
    }
    return map;
  }, [data.check_ins, activeStart, activeEnd]);

  
  const handleExportHTML = () => {
    const html = generateExportHTML(data, settings, selectedRotation, grants);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `battle_royale_${data.name.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filter mode toggle + Rotation/Custom selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-gray-900 rounded-xl p-1 max-w-xs">
          <button
            onClick={() => setFilterMode('rotation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterMode === 'rotation' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            📅 Rotations
          </button>
          <button
            onClick={() => setFilterMode('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterMode === 'custom' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            🔧 Custom
          </button>
        </div>

        {filterMode === 'rotation' && (
          <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Rotation</span>
            <select
              value={selectedRotation}
              onChange={e => setSelectedRotation(Number(e.target.value))}
              className="bg-transparent text-gray-100 text-sm font-semibold focus:outline-none cursor-pointer"
            >
              {ROTATIONS.map(r => (
                <option key={r.num} value={r.num}>
                  {r.label} — {formatDate(r.start.slice(0, 10))} to {formatDate(r.end.slice(0, 10))}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-600 border-l border-gray-700 pl-2 whitespace-nowrap">
              {formatDate(rotation.start.slice(0, 10))} – {formatDate(rotation.end.slice(0, 10))}
            </span>
          </div>
        )}

        {filterMode === 'custom' && (
          <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-orange-500"
              placeholder="Start"
            />
            <span className="text-gray-600 text-xs">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-orange-500"
              placeholder="End"
            />
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          <button
            onClick={handleExportHTML}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-green-700 hover:bg-green-600 text-white transition-colors"
            title="Export current rotation as standalone HTML file"
          >
            🗂 Export HTML
          </button>
          <button
            onClick={() => setMode('team')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              mode === 'team'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            👥 Team vs Team
          </button>
          <button
            onClick={() => setMode('player')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              mode === 'player'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            🥊 Player vs Player
          </button>
          <button
            onClick={() => setMode('tournament')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              mode === 'tournament'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            🏆 Battle Royale Network View
          </button>
        </div>
      </div>

      {mode === 'team'
        ? <TeamVsTeam data={data} memberStats={memberStats} onPlayerClick={onPlayerClick} rotationStart={activeStart} rotationEnd={activeEnd} rotationActivityMap={rotationActivityMap} />
        : mode === 'player'
        ? <PlayerVsPlayer data={data} memberStats={memberStats} onPlayerClick={onPlayerClick} rotationStart={activeStart} rotationEnd={activeEnd} rotationActivityMap={rotationActivityMap} />
        : <TournamentNetwork data={data} rotationStart={activeStart} rotationEnd={activeEnd} featuredTeamName={rotation.featuredTeam} />
      }
    </div>
  );
}
