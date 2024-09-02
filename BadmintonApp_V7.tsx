'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { AlertCircle, Upload, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

type Player = {
  id: number
  name: string
  ranking: number
  eloRating: number
  waitingTime: number
  gamesPlayed: number
  partners: number[]
}

type Court = {
  team: number
  players: Player[]
}[]

const INITIAL_ELO_RATING = 1500
const K_FACTOR = 32

// Simulating a database with localStorage
const saveToDatabase = (players: Player[]) => {
  localStorage.setItem('badmintonPlayers', JSON.stringify(players))
}

const loadFromDatabase = (): Player[] => {
  const savedPlayers = localStorage.getItem('badmintonPlayers')
  return savedPlayers ? JSON.parse(savedPlayers) : []
}

export default function BadmintonApp() {
  const [players, setPlayers] = useState<Player[]>([])
  const [waitingZone, setWaitingZone] = useState<Player[]>([])
  const [restZone, setRestZone] = useState<Player[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [numCourts, setNumCourts] = useState(4)
  const [error, setError] = useState<string | null>(null)
  const [csvContent, setCsvContent] = useState('')
  const [parsingLog, setParsingLog] = useState<string[]>([])
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [activeTab, setActiveTab] = useState('courts')

  useEffect(() => {
    const loadedPlayers = loadFromDatabase()
    setPlayers(loadedPlayers)
  }, [])

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setError('No file selected. Please choose a CSV file.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        setCsvContent(content)
        const { parsedPlayers, log } = parseCSV(content)
        setParsingLog(log)
        if (parsedPlayers.length > 0) {
          setPlayers(parsedPlayers)
          saveToDatabase(parsedPlayers)
          setError(null)
        } else {
          setError('No valid player data found in the CSV file')
        }
      } catch (err) {
        setError(`Error parsing CSV file: ${(err as Error).message}`)
      }
    }
    reader.onerror = (e) => {
      setError(`Error reading file: ${e.target?.error}`)
    }
    reader.readAsText(file)
  }, [])

  const parseCSV = (content: string): { parsedPlayers: Player[]; log: string[] } => {
    const log: string[] = []
    const parsedPlayers: Player[] = []
    
    const lines = content.split(/[\r\n]+/).filter(line => line.trim() !== '')
    
    log.push(`Total lines: ${lines.length}`)
    log.push(`Raw content: ${content}`)
    
    const possibleDelimiters = [',', ';', '\t']
    let delimiter = possibleDelimiters.find(d => lines[0].includes(d)) || ','
    log.push(`Detected delimiter: "${delimiter}"`)

    lines.forEach((line, i) => {
      log.push(`Processing line ${i + 1}: ${line}`)
      
      const parts = line.split(delimiter).map(part => part.trim())
      
      if (parts.length < 2 || isNaN(parseInt(parts[1]))) {
        log.push(`Skipping line ${i + 1}: Invalid format or header`)
        return
      }
      
      const [name, rankingStr] = parts
      const ranking = parseInt(rankingStr)
      
      if (name && !isNaN(ranking)) {
        parsedPlayers.push({
          id: parsedPlayers.length + 1,
          name,
          ranking,
          eloRating: INITIAL_ELO_RATING,
          waitingTime: 0,
          gamesPlayed: 0,
          partners: [],
        })
        log.push(`Added player: ${name} with ranking ${ranking}`)
      } else {
        log.push(`Skipped invalid data on line ${i + 1}: Name: "${name}", Ranking: "${rankingStr}"`)
      }
    })
    
    log.push(`Total players parsed: ${parsedPlayers.length}`)
    
    return { parsedPlayers, log }
  }

  const moveToWaitingZone = useCallback((playerId: number) => {
    setPlayers(prevPlayers => prevPlayers.filter(p => p.id !== playerId))
    setRestZone(prevRest => prevRest.filter(p => p.id !== playerId))
    setWaitingZone(prevWaiting => {
      const playerToMove = players.find(p => p.id === playerId) || restZone.find(p => p.id === playerId)
      if (playerToMove) {
        return [...prevWaiting, { ...playerToMove, waitingTime: 0 }]
      }
      return prevWaiting
    })
  }, [players, restZone])

  const moveToRestZone = useCallback((playerId: number) => {
    setPlayers(prevPlayers => prevPlayers.filter(p => p.id !== playerId))
    setWaitingZone(prevWaiting => prevWaiting.filter(p => p.id !== playerId))
    setRestZone(prevRest => {
      const playerToMove = players.find(p => p.id === playerId) || waitingZone.find(p => p.id === playerId)
      if (playerToMove) {
        return [...prevRest, { ...playerToMove, waitingTime: 0 }]
      }
      return prevRest
    })
  }, [players, waitingZone])

  const allocatePlayersToEmptyCourt = useCallback((availablePlayers: Player[]): { court: Court | null, remainingPlayers: Player[] } => {
    if (availablePlayers.length < 4) return { court: null, remainingPlayers: availablePlayers }

    // Sort players by games played (ascending) and then by waiting time (descending)
    availablePlayers.sort((a, b) => {
      if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed
      return b.waitingTime - a.waitingTime
    })

    const selectedPlayers = availablePlayers.slice(0, 4)
    
    // Sort selected players by Elo rating
    selectedPlayers.sort((a, b) => b.eloRating - a.eloRating)

    // Pair players: highest with lowest, second highest with second lowest
    const newCourt: Court = [
      { team: 1, players: [selectedPlayers[0], selectedPlayers[3]] },
      { team: 2, players: [selectedPlayers[1], selectedPlayers[2]] }
    ]

    // Update partners for each player
    newCourt.forEach(team => {
      team.players[0].partners.push(team.players[1].id)
      team.players[1].partners.push(team.players[0].id)
    })

    return {
      court: newCourt,
      remainingPlayers: availablePlayers.slice(4)
    }
  }, [])

  const allocateCourts = useCallback(() => {
    let availablePlayers = [...waitingZone]
    const newCourts: Court[] = []

    for (let i = 0; i < numCourts; i++) {
      const { court, remainingPlayers } = allocatePlayersToEmptyCourt(availablePlayers)
      if (court) {
        newCourts.push(court)
        availablePlayers = remainingPlayers
      } else {
        break
      }
    }

    setCourts(newCourts)
    setWaitingZone(availablePlayers)
  }, [numCourts, waitingZone, allocatePlayersToEmptyCourt])

  const updateEloRatings = (winningTeam: Player[], losingTeam: Player[]) => {
    const winningTeamRating = winningTeam.reduce((sum, player) => sum + player.eloRating, 0) / 2
    const losingTeamRating = losingTeam.reduce((sum, player) => sum + player.eloRating, 0) / 2

    const expectedScoreWinning = 1 / (1 + Math.pow(10, (losingTeamRating - winningTeamRating) / 400))
    const expectedScoreLosing = 1 - expectedScoreWinning

    winningTeam.forEach(player => {
      player.eloRating += Math.round(K_FACTOR * (1 - expectedScoreWinning))
    })

    losingTeam.forEach(player => {
      player.eloRating += Math.round(K_FACTOR * (0 - expectedScoreLosing))
    })
  }

  const endMatch = useCallback((courtIndex: number, winningTeam: number) => {
    setCourts(prev => {
      const updatedCourts = [...prev]
      const finishedCourt = updatedCourts[courtIndex]
      const playersFromCourt = finishedCourt.flatMap(team => team.players)

      const winningPlayers = finishedCourt[winningTeam - 1].players
      const losingPlayers = finishedCourt[winningTeam === 1 ? 1 : 0].players

      updateEloRatings(winningPlayers, losingPlayers)

      setWaitingZone(prevWaiting => {
        const updatedWaiting = [
          ...prevWaiting,
          ...playersFromCourt.map(player => ({
            ...player,
            waitingTime: 0,
            gamesPlayed: player.gamesPlayed + 1
          }))
        ]

        const { court, remainingPlayers } = allocatePlayersToEmptyCourt(updatedWaiting)
        if (court) {
          updatedCourts[courtIndex] = court
          return remainingPlayers
        } else {
          updatedCourts.splice(courtIndex, 1)
          return updatedWaiting
        }
      })

      setPlayers(prevPlayers => {
        const updatedPlayers = prevPlayers.map(player => {
          const updatedPlayer = playersFromCourt.find(p => p.id === player.id)
          return updatedPlayer ? { ...player, ...updatedPlayer } : player
        })
        saveToDatabase(updatedPlayers)
        return updatedPlayers
      })

      return updatedCourts
    })
  }, [allocatePlayersToEmptyCourt])

  const overridePlayerRating = useCallback((playerId: number, newRating: number) => {
    const updatePlayerRating = (playerList: Player[]) =>
      playerList.map(player =>
        player.id === playerId ? { ...player, eloRating: newRating } : player
      )

    setPlayers(prevPlayers => {
      const updatedPlayers = updatePlayerRating(prevPlayers)
      saveToDatabase(updatedPlayers)
      return updatedPlayers
    })
    setWaitingZone(updatePlayerRating)
    setRestZone(updatePlayerRating)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setWaitingZone(prev => prev.map(player => ({ ...player, waitingTime: player.waitingTime + 1 })))
    }, 60000) // Increase waiting time every minute

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Badminton Game Organizer</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="courts">Courts</TabsTrigger>
          <TabsTrigger value="waiting">Waiting Zone</TabsTrigger>
          <TabsTrigger value="rest">Rest Zone</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        <TabsContent value="courts">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courts.map((court, courtIndex) => (
              <Card key={courtIndex}>
                <CardHeader>
                  <CardTitle>Court {courtIndex + 1}</CardTitle>
                </CardHeader>
                <CardContent>
                  {court.map((team, teamIndex) => (
                    <div key={teamIndex} className="mb-2">
                      <h4 className="font-medium">Team {team.team}</h4>
                      <ul>
                        {team.players.map((player, playerIndex) => (
                          <li key={playerIndex}>
                            {player.name} (Rank: {player.ranking}, Elo: {player.eloRating}, Games: {player.gamesPlayed})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <Button onClick={() => endMatch(courtIndex, 1)}>Team 1 Wins</Button>
                    <Button onClick={() => endMatch(courtIndex, 2)}>Team 2 Wins</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="waiting">
          <Card>
            <CardHeader>
              <CardTitle>Waiting Zone ({waitingZone.length} players)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Elo Rating</TableHead>
                    <TableHead>Waiting Time</TableHead>
                    <TableHead>Games Played</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitingZone.map(player => (
                    <TableRow key={player.id}>
                      <TableCell>{player.name}</TableCell>
                      <TableCell>{player.ranking}</TableCell>
                      <TableCell>{player.eloRating}</TableCell>
                      <TableCell>{player.waitingTime}</TableCell>
                      <TableCell>{player.gamesPlayed}</TableCell>
                      <TableCell>
                        <Button variant="outline" onClick={() => moveToRestZone(player.id)}>
                          Move to Rest Zone
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rest">
          <Card>
            <CardHeader>
              <CardTitle>Rest Zone ({restZone.length} players)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Elo Rating</TableHead>
                    <TableHead>Games Played</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {restZone.map(player => (
                    <TableRow key={player.id}>
                      <TableCell>{player.name}</TableCell>
                      <TableCell>{player.ranking}</TableCell>
                      <TableCell>{player.eloRating}</TableCell>
                      <TableCell>{player.gamesPlayed}</TableCell>
                      <TableCell>
                        <Button variant="outline" onClick={() => moveToWaitingZone(player.id)}>
                          Move to Waiting Zone
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players">
          <Card>
            <CardHeader>
              <CardTitle>All Players ({players.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Elo Rating</TableHead>
                    <TableHead>Games Played</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map(player => (
                    <TableRow key={player.id}>
                      <TableCell>{player.name}</TableCell>
                      <TableCell>{player.ranking}</TableCell>
                      <TableCell>{player.eloRating}</TableCell>
                      <TableCell>{player.gamesPlayed}</TableCell>
                      <TableCell>
                        <Button variant="outline" onClick={() => moveToWaitingZone(player.id)} className="mr-2">
                          Move to Waiting Zone
                        </Button>
                        <Button variant="outline" onClick={() => moveToRestZone(player.id)}>
                          Move to Rest Zone
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="admin-mode">Admin Mode</Label>
                  <Switch
                    id="admin-mode"
                    checked={isAdminMode}
                    onCheckedChange={setIsAdminMode}
                  />
                </div>

                <div>
                  <Label htmlFor="csv-upload">Upload CSV File</Label>
                  <div className="flex items-center mt-1">
                    <Label htmlFor="csv-upload" className="cursor-pointer inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                      <Upload className="h-5 w-5 mr-2" />
                      Choose CSV file
                    </Label>
                    <Input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="num-courts">Number of Courts</Label>
                  <Input
                    id="num-courts"
                    type="number"
                    value={numCourts}
                    onChange={(e) => setNumCourts(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full mt-1"
                  />
                </div>

                <Button onClick={allocateCourts}>
                  Allocate Courts
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Information</CardTitle>
            </CardHeader>
            <CardContent>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="flex items-center justify-between w-full mb-2">
                    Algorithm and Elo Rating Explanation
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card>
                    <CardContent>
                      <h3 className="text-lg font-semibold mb-2">Player Selection Algorithm</h3>
                      <p>1. Players are sorted by games played (ascending) and waiting time (descending).</p>
                      <p>2. The top 4 players are selected for a court.</p>
                      <p>3. These 4 players are then sorted by Elo rating.</p>
                      <p>4. Teams are formed by pairing the highest-rated player with the lowest, and the second-highest with the second-lowest.</p>
                      
                      <h3 className="text-lg font-semibold mt-4 mb-2">Elo Rating Calculation</h3>
                      <p>After each game, Elo ratings are updated using the following formula:</p>
                      <p>New Rating = Old Rating + K * (Actual Score - Expected Score)</p>
                      <p>Where:</p>
                      <ul className="list-disc list-inside">
                        <li>K is a factor determining the maximum change in rating (set to 32)</li>
                        <li>Actual Score is 1 for a win, 0 for a loss</li>
                        <li>Expected Score is calculated based on the difference in team ratings</li>
                      </ul>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="flex items-center justify-between w-full mb-2">
                    FAQ
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card>
                    <CardContent>
                      <h3 className="text-lg font-semibold mb-2">Frequently Asked Questions</h3>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium">Q: How are players selected for matches?</h4>
                          <p>A: Players are selected based on the number of games played and waiting time, with priority given to those who have played fewer games and waited longer.</p>
                        </div>
                        <div>
                          <h4 className="font-medium">Q: What is the Elo rating system?</h4>
                          <p>A: The Elo rating system is a method for calculating the relative skill levels of players. It's updated after each game based on the expected outcome and the actual result.</p>
                        </div>
                        <div>
                          <h4 className="font-medium">Q: How are teams balanced?</h4>
                          <p>A: Teams are balanced by pairing players with different skill levels, based on their Elo ratings.</p>
                        </div>
                        <div>
                          <h4 className="font-medium">Q: Can I manually adjust player ratings?</h4>
                          <p>A: Yes, in admin mode, you can override a player's Elo rating if needed.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>

              {isAdminMode && (
                <>
                  <Collapsible className="mt-4">
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="flex items-center justify-between w-full">
                        CSV Content
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Card>
                        <CardContent>
                          <pre className="bg-muted p-4 rounded overflow-x-auto">
                            {csvContent}
                          </pre>
                        </CardContent>
                      </Card>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible className="mt-4">
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="flex items-center justify-between w-full">
                        Parsing Log
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Card>
                        <CardContent>
                          <pre className="bg-muted p-4 rounded overflow-x-auto">
                            {parsingLog.join('\n')}
                          </pre>
                        </CardContent>
                      </Card>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}